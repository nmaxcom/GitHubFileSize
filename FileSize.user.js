// ==UserScript==
// @name         GitHub FileSize Viewer
// @namespace    https://github.com/nmaxcom/
// @version      0.9.13
// @description  Show the file size next to it on the GitHub file explorer
// @author       nmaxcom
// @homepage     https://github.com/nmaxcom/GitHubFileSize
// @homepageURL  https://github.com/nmaxcom/GitHubFileSize
// @downloadURL  https://github.com/nmaxcom/GitHubFileSize/blob/master/FileSize.user.js
// @updateURL    https://github.com/nmaxcom/GitHubFileSize/blob/master/FileSize.user.js
// @match        https://*.github.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

// TODO: https://www.sitepoint.com/10-ways-minimize-reflows-improve-performance/
// TODO: find out why sometimes the cells (and the API call it seems) is made two or even three times!
// TODO: doesn't work when a folder has a space %20 in it. Response is "Not Found"

(function() {
    /****************
     * Options:
     ****************/
    const DEBUG_MODE = true; // in production mode should be false
    const SHOW_BYTES = true; // false: always KB, i.e. '>1 KB', true: i.e. '180 B' when less than 1 KB
    const TEXT_COLOR = '#6a737d'; // Default github style
    /****************/

    if (DEBUG_MODE) console.log(`%cStart: ${document.title}`, 'color:white;background-color:#20A6E8;padding:3px');

    const targetExists = () => {
        return document.querySelector('table.files');
    };
    let vars = {};

    /**
     * Starting condition: the pjax load being successful or this is a regular page load
     */

    // waiting for pjax:success might be the reason why our results appear late. Will try with a setInterval
    // document.addEventListener('pjax:success', () => {
    //     tableCheckandGo();
    // });
    const intervalID = setInterval(() => {}, 200);
    window.onload = tableCheckandGo();

    /**
     * Order of business:
     * - Detect table, if present, launch async API call and insert new blank cells
     * - Detect necessary info to make the async API call
     * - When promised is successful, change the blanks for the numbers
     * done: detect page change since github does that youtube thing
     */

    function tableCheckandGo() {
        if (targetExists()) {
            createStyles(); // Prepare the small CSS for the size info
            if (setVars()) {
                callGitHubPromise()
                    .then(resp => {
                        if (DEBUG_MODE) console.info('GitHub call went through: \n' + resp.responseText);
                        insertBlankCells();
                        fillTheBlanks(JSON.parse(resp.responseText));
                        recheckAndFix();
                    })
                    .catch(fail => {
                        if (DEBUG_MODE) console.error(`Fail!:${fail}`);
                    });
            } else {
                if (DEBUG_MODE) console.info('setVars() failed. Vars: ', vars);
            }
        } else {
            if (DEBUG_MODE) console.info('No data table detected, nothing to do');
        }
    }

    /**
     * API call
     */
    function callGitHubPromise() {
        return new Promise((resolve, reject) => {
            // I'm forced to use GM_xmlhttpRequest to avoid Same Origin Policy issues
            GM_xmlhttpRequest({
                method: 'GET',
                url: getAPIurl(),
                onload(res) {
                    resolve(res);
                },
                onerror(res) {
                    reject(res);
                },
            });
        });
    }

    function getAPIurl() {
        // .../repos/:owner/:repo/contents/:path?ref=branch
        vars.dir = vars.dir || '';
        return `https://api.github.com/repos/${vars.owner}/${vars.repo}/contents/${vars.dir}?ref=${vars.branch}`;
    }

    /**
     * - Directories get new cellmate too. It'll be empty as we have no size info on directories.
     *
     */
    function insertBlankCells() {
        const filenameCells = document.querySelectorAll('tr[class~="js-navigation-item"] > td.content');
        for (var i = 0, len = filenameCells.length; i < len; i++) {
            const newtd = document.createElement('td');
            newtd.className = 'filesize';
            filenameCells[i].parentNode.insertBefore(newtd, filenameCells[i].nextSibling);
        }
        if (DEBUG_MODE) console.info(`Inserted ${i} cells`);
    }

    /**
     * If we get the data, we insert it carefully so each filename gets matched
     * with the correct filesize.
     */
    function fillTheBlanks(JSONelements) {
        if (!document.querySelectorAll('td.filesize').length) {
            if (DEBUG_MODE) debugger;
        }
        const nametds = document.querySelectorAll('tr[class~="js-navigation-item"] > td.content a');
        var i, len;
        toploop: for (i = 0, len = JSONelements.length; i < len; i++) {
            for (const cellnum in nametds) {
                // TODO: for .. of?
                if (nametds.hasOwnProperty(cellnum) && JSONelements[i].name === nametds[cellnum].innerHTML) {
                    if (JSONelements[i].type === 'file') {
                        let sizeNumber = (JSONelements[i].size / 1024).toFixed(0);
                        if (SHOW_BYTES) {
                            sizeNumber = sizeNumber < 1 ? `${JSONelements[i].size} B` : `${sizeNumber} KB`;
                        } else {
                            sizeNumber = sizeNumber < 1 ? '> 1 KB' : `${sizeNumber} KB`;
                        }
                        nametds[cellnum].parentNode.parentNode.nextSibling.innerHTML = sizeNumber;
                    }
                    continue toploop;
                }
            }
        }
        if (DEBUG_MODE) console.info(`Processed ${i} of ${len} elements`);
        // if(DEBUG_MODE) console.info('Dumping json y nodes:');
        // if(DEBUG_MODE) console.log(JSONelements.forEach(function(e,i){if(DEBUG_MODE) console.log(JSONelements[i].name)}));
        // if(DEBUG_MODE) console.log(nametds.forEach(function(e,i){if(DEBUG_MODE) console.log(nametds[i].innerHTML)}));
    }

    function createStyles() {
        const css = `td.filesize { color: ${TEXT_COLOR}; text-align: right; padding-right: 50px !important; } table.files td.message { max-width: 250px !important;`;
        const head = document.head || document.getElementsByTagName('head')[0];
        const styleBlock = document.createElement('style');

        styleBlock.type = 'text/css';
        if (styleBlock.styleSheet) {
            styleBlock.styleSheet.cssText = css;
        } else {
            styleBlock.appendChild(document.createTextNode(css));
        }
        head.appendChild(styleBlock);
    }

    /**
     * Hay que satisfacer en la api el GET /repos/:owner/:repo/contents/:path?ref=branch
     * Con este regex capturamos del título  \w+(.*?)\sat\s(.*?)\s.*?(\w+)\/(\w+)
     * 1) dir path, 2) branch, 3) owner, 4) repo
     * Ese regex no funciona en el root
     */
    function setVars() {
        const title = document.title;
        // Root folder:
        const match3 = title.match(/.*?([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+):/);
        // Non root folder, any branch:
        //var match1 = title.match(/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\sat\s([a-zA-Z0-9._-]+)\s·\s([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/);
        // Root folder, we'll extract branch from scrape
        const match2 = title.match(/.+?\/([a-zA-Z0-9._\/-]+).*?·\s([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._\/-]+)/);
        if (match3) {
            vars = { owner: match3[1], repo: match3[2] };
            vars.branch = document.querySelector('.branch-select-menu button span').innerHTML;
        } else if (match2) {
            /*else if(match1) {
         vars = {repo: match1[1], dir: match1[2], branch: match1[3], owner: match1[4]};
         } */ vars = { dir: match2[1], owner: match2[2], repo: match2[3] };
            vars.branch = document.querySelector('.branch-select-menu button span').innerHTML;
        } else if (DEBUG_MODE) console.log(getAPIurl());
        return 1;
    }

    /**
     * Sometimes, even though data has been correctly recieved, the DOM doesn't play well
     * for whatever reason. This function will quickly check if the data is indeed
     * there and if it's not will repaint the data again with the original functions.
     * TODO: finish this part
     */
    function recheckAndFix() {
        // Count td.filesize and compare to total rows
        let filesizes = document.querySelectorAll('td.filesize').length;
        let ages = document.querySelectorAll('td.age').length;
        if (filesizes === ages) {
            if (DEBUG_MODE) console.info(`Good empty check: ${filesizes} of ${ages}`);
        } else {
            if (DEBUG_MODE) console.info(`Bad empty check: ${filesizes} of ${ages}. Repainting`);
        }
        // Count non-empty td.filesize and compare to number of files from response
        // if (DEBUG_MODE) console.info(`Say something...`);
    }
})();
