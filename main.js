// ==UserScript==
// @name         GitHub fileSize viewer
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Show the file size next to it on the website
// @author       nmaxcom
// @match        https://*.github.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==


(function(){
    // var textColor = '#6a737d'; // Default github style
    var textColor = '#888'; // dark github style
    styleUp();

    var origXHROpen               = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(){
        this.addEventListener('loadend', function(){
            console.log('%cStart: ' + document.title, 'color:white;background-color:#20A6E8;padding:3px');
            tableCheckandGo();
        });
        origXHROpen.apply(this, arguments);
    };

    var vars = {};
    tableCheckandGo();
    /**
     * Order of business:
     * - Detect table, if present, launch async API call and insert new blank cells
     * - Detect necessary info to make the async API call
     * - When promised is successful, change the blanks for the numbers
     * done: detect page change since github does that youtube thing
     */

    function tableCheckandGo(){
        if(document.querySelector('table.files')){
            if(setVars()){
                var callPromise = callGitHub();
                callPromise
                    .then(function(response){
                        console.info('GitHub call went through');
                        console.info(response.responseText);
                        console.info(insertBlankCells());
                        console.info(fillTheBlanks(JSON.parse(response.responseText)));
                    })
                    .catch(function(fail){
                        console.error(fail);
                    });
            } else{
                console.info('setVars() failed. Vars: ', vars);
            }
        } else{
            console.info('No data table detected, nothing to do');
        }
    }

    /**
     * API call
     */
    function callGitHub(){
        return new Promise(function(resolve, reject){
            // I'm forced to use GM_xmlhttpRequest to avoid Same Origin Policy issues
            GM_xmlhttpRequest({
                method : "GET",
                url    : getAPIurl(),
                onload : function(res){
                    resolve(res);
                },
                onerror: function(res){
                    reject(res);
                }
            });
        });
    }

    function getAPIurl(){
        // .../repos/:owner/:repo/contents/:path?ref=branch
        vars.dir = vars.dir || '';
        return "https://api.github.com/repos/" +
            vars.owner + "/" +
            vars.repo +
            "/contents/" +
            vars.dir + "?ref=" + vars.branch;
    }

    /**
     * - Directories get new cell too
     *
     */
    function insertBlankCells(){
        var i, len;
        var FileNameCells = document.querySelectorAll('tr[class="js-navigation-item"] > td.content');
        for(i = 0, len = FileNameCells.length; i < len; i++){
            var tmp       = document.createElement('td');
            tmp.className = 'filesize';
            FileNameCells[i].parentNode.insertBefore(tmp, FileNameCells[i].nextSibling);
        }
        return `Inserted ${i} cells`;
    }

    /**
     * If we get the data, we insert it carefully so each filename gets matched
     * with the correct filesize.
     * - TODO: We'll probably run this function twice to avoid losing one or two rows, so
     *   we will have to check first if our cell exists there already or not.
     */
    function fillTheBlanks(JSONelements){
        if(!document.querySelectorAll('td.filesize').length){
            debugger;
        }
        var nametds = document.querySelectorAll('tr[class~="js-navigation-item"] > td.content a');
        var i, len;
        toploop:
            for(i = 0, len = JSONelements.length; i < len; i++){
                for(var cellnum in nametds){
                    if(nametds.hasOwnProperty(cellnum)){
                        if(JSONelements[i].name === nametds[cellnum].innerHTML){
                            if(JSONelements[i].type === 'file'){
                                var sizeNumber  = (JSONelements[i].size / 1024).toFixed(0);
                                //sizeNumber = sizeNumber < 1 ? '>1' : sizeNumber;
                                sizeNumber = sizeNumber < 1 ? JSONelements[i].size + ' B' : sizeNumber + ' KB';
                                nametds[cellnum].parentNode.parentNode.nextSibling.innerHTML = sizeNumber;
                            }
                            continue toploop;
                        }
                    }
                }
            }
        return `Filled ${i} of ${len} elements`;
        // console.info('Dumping json y nodes:');
        // console.log(JSONelements.forEach(function(e,i){console.log(JSONelements[i].name)}));
        // console.log(nametds.forEach(function(e,i){console.log(nametds[i].innerHTML)}));


    }

    function styleUp(){
        var css   = 'td.filesize { color: ' + textColor + ';' +
                'text-align: right;' +
                'padding-right: 50px !important; }' +
                'table.files td.message { max-width: 250px !important;',
            head  = document.head || document.getElementsByTagName('head')[0],
            style = document.createElement('style');

        style.type = 'text/css';
        if(style.styleSheet){
            style.styleSheet.cssText = css;
        } else{
            style.appendChild(document.createTextNode(css));
        }

        head.appendChild(style);
    }


    /**
     * Hay que satisfacer en la api el GET /repos/:owner/:repo/contents/:path?ref=branch
     * Con este regex capturamos del título  \w+(.*?)\sat\s(.*?)\s.*?(\w+)\/(\w+)
     * 1) dir path, 2) branch, 3) owner, 4) repo
     * Ese regex no funciona en el root
     * @returns {object}
     */
    function setVars(){
        var title  = document.title;
        // Root folder:
        var match3 = title.match(/.*?([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+):/);
        // Non root folder, any branch:
        //var match1 = title.match(/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\sat\s([a-zA-Z0-9._-]+)\s·\s([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/);
        // Root folder, we'll extract branch from scrape
        var match2 = title.match(/.+?\/([a-zA-Z0-9._\/-]+).*?·\s([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._\/-]+)/);
        if(match3){
            vars        = {owner: match3[1], repo: match3[2]};
            vars.branch = document.querySelector('.branch-select-menu button span').innerHTML;
        }/*else if(match1) {
         vars = {repo: match1[1], dir: match1[2], branch: match1[3], owner: match1[4]};
         } */ else if(match2){
            vars        = {dir: match2[1], owner: match2[2], repo: match2[3]};
            vars.branch = document.querySelector('.branch-select-menu button span').innerHTML;
        } else
            console.log(getAPIurl());
        return 1;
    }
})();