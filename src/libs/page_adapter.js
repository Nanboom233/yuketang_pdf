// 新版只操作用户已经打开的同源报告，不依赖 Vue 私有状态或站点 API。
export const REPORT_PATH = /^\/v2\/web\/student-lesson-report\/[^/]+\/[^/]+\/[^/]+\/?$/;
const DETAIL = '.stu-problem-detail-wrap-pc';
const ROWS = '.quiz-table .list-content > .list-item .item-info';
const TABS = '.left-panel-tab-title > .box-start > .tab-item';
const FILTERS = '.left-panel-tab-content .tab-wrap > .tab-item';

function nodeText(node){
    return node ? node.textContent.trim() : '';
}

export function reportContext(doc = document){
    if (!REPORT_PATH.test(doc.location.pathname)) return null;
    var header = doc.querySelector('.lesson-header');
    var frame = doc.querySelector('iframe.lesson-report-mobile');
    if (!header || !frame) return null;
    return { header, frame, document: doc, identity: doc.location.pathname,
        filename: (nodeText(doc.querySelector('.lesson-title')) || '雨课堂课件') + '.pdf' };
}

export function imageKey(value, base){
    var url = new URL(value, base);
    url.searchParams.delete('e');
    url.searchParams.delete('token');
    url.hash = '';
    return url.href;
}

export function reportSlides(doc){
    var nodes = Array.from(doc.querySelectorAll('.slide-detail-wrap .slide-list > .slide-item'));
    if (!nodes.length) throw new Error('没有提取到完整课件，请等待课件加载后重试');
    return nodes.map((node, index) => {
        var img = node.querySelector('.slide-img img');
        var value = img && (img.getAttribute('data-src') || img.getAttribute('src'));
        if (!value || value.startsWith('data:')) throw new Error(`第 ${index + 1} 页缺少真实图片地址`);
        var url = new URL(value, doc.baseURI).href;
        if (!/^https?:/.test(url)) throw new Error(`第 ${index + 1} 页图片地址无效`);
        return { index, url, key: imageKey(url), label: nodeText(node.querySelector('.slide-desc > span')) };
    });
}

function coursewareFilenames(groups){
    var used = new Set();
    return groups.map(group => {
        var base = group.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 160) || '雨课堂课件';
        if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = '_' + base;
        var name = base, suffix = 2;
        while (used.has(name.toLowerCase())) name = `${base} (${suffix++})`;
        used.add(name.toLowerCase());
        return { ...group, filename: name + '.pdf' };
    });
}

/** 打印菜单封面是分组起点，页码仅校验；不按文件名或 P1 猜测多个分组。 */
export function reportCoursewares(doc, slides, fallbackTitle){
    var menu = Array.from(doc.querySelectorAll('.print-btn .ppt-list-item'));
    var fail = () => { throw new Error('无法可靠识别课件划分，请等待打印课件菜单加载后重试'); };
    if (!slides.length) return fail();
    var groups;
    if (menu.length){
        groups = menu.map(item => {
            var title = nodeText(item.querySelector('.ppt-title'));
            var img = item.querySelector('.ppt-cover img');
            var value = img && (img.getAttribute('data-src') || img.getAttribute('src'));
            if (!title || !value) return fail();
            var coverKey = imageKey(value, doc.baseURI);
            var matches = slides.filter(slide => slide.key === coverKey);
            if (matches.length !== 1) return fail();
            return { title, coverKey, startIndex: matches[0].index };
        });
        if (groups[0].startIndex !== 0) return fail();
    } else {
        var print = doc.querySelector('.print-btn');
        if (!print || print.querySelector('.icon-jiantoudan-xiangxia,.icon-jiantoudan-xiangshang')) return fail();
        groups = [{ title: fallbackTitle || '雨课堂课件', coverKey: slides[0].key, startIndex: 0 }];
    }
    groups.forEach((group, i) => {
        var end = i + 1 < groups.length ? groups[i + 1].startIndex : slides.length;
        group.pageCount = end - group.startIndex;
        if (group.pageCount <= 0) return fail();
        for (let n = group.startIndex; n < end; n++){
            if (slides[n].label !== `P${n - group.startIndex + 1}`) return fail();
        }
    });
    return coursewareFilenames(groups);
}

export function coursewareSignature(result){
    return JSON.stringify([result.coursewares, result.slides.map(slide => slide.key)]);
}

export function coursewareContent(result, group){
    var end = group.startIndex + group.pageCount;
    return { filename: group.filename, slides: result.slides.slice(group.startIndex, end),
        answers: result.answers.filter(answer => answer.index >= group.startIndex && answer.index < end)
            .map(answer => ({ ...answer, index: answer.index - group.startIndex })) };
}

function textTab(doc, selector, text){
    return Array.from(doc.querySelectorAll(selector)).find(el => el.textContent.trim() === text);
}

function activeText(doc, selector){
    return nodeText(doc.querySelector(selector + '.active'));
}

function filtersFor(tab){
    var content = tab === '课件' ? '.slide-detail-wrap' : '.courseware-cmp-wrap';
    return `.left-panel-tab-content ${content} .tab-wrap > .tab-item`;
}

function detailImage(doc){
    var img = doc.querySelector(`${DETAIL} .answer-box img.slide-img`);
    var value = img && (img.getAttribute('data-src') || img.getAttribute('src'));
    return value ? imageKey(value, doc.baseURI) : null;
}

export function matchAnswer(slides, answers, key, ans){
    var targets = slides.filter(slide => slide.key === key);
    if (!targets.length) throw new Error('习题图片无法关联到课件，已停止附答案');
    for (let slide of targets){
        let old = answers.find(answer => answer.index === slide.index);
        if (old && old.ans !== ans) throw new Error(`第 ${slide.index + 1} 页出现冲突答案`);
        if (!old) answers.push({ index: slide.index, ans });
    }
}

/** UI 切换均串行等待；取消只终止采集，finally 仍恢复同一报告的视图。 */
export async function collectReport(context, { withAnswers, withCoursewares = false, signal, progress = () => {}, timeout = 15000 } = {}){
    var doc;
    try { doc = context.frame.contentDocument; } catch (err) { /* 下面统一提示 */ }
    if (!doc || !doc.querySelector('#content-page-wrap')) throw new Error('课件尚未加载或 iframe 不可访问，请稍后重试');
    var sameReport = () => context.frame.isConnected && context.document.location.pathname === context.identity &&
        context.frame.contentDocument === doc;
    var check = (restoring = false) => {
        if (!sameReport()) throw new Error('报告已切换，已取消下载');
        if (!restoring && signal && signal.aborted) throw new Error('已取消下载');
    };
    var wait = async (predicate, message, restoring = false) => {
        var start = Date.now();
        while (Date.now() - start < timeout){
            check(restoring);
            var result = predicate();
            if (result) return result;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(message);
    };
    var closeDetail = async restoring => {
        check(restoring);
        if (!doc.querySelector(DETAIL)) return;
        var close = doc.querySelector('.close-change-left');
        if (!close) throw new Error('找不到习题详情返回按钮');
        close.click();
        await wait(() => !doc.querySelector(DETAIL), '关闭习题详情超时', restoring);
    };
    var openDetail = async (index, restoring = false) => {
        check(restoring);
        await closeDetail(restoring);
        var row = doc.querySelectorAll(ROWS)[index];
        if (!row) throw new Error('习题列表发生变化，请重试');
        row.click();
        // 必须等待一次关闭→重新出现，不能沿用上一题的答案节点。
        await wait(() => detailImage(doc), `第 ${index + 1} 道习题加载超时`, restoring);
    };
    var select = async (selector, text, restoring = false) => {
        check(restoring);
        if (!text) return;
        // 页签选中状态先更新，内部组件可能还在异步挂载。
        var tab = await wait(() => textTab(doc, selector, text), `等待“${text}”标签加载超时`, restoring);
        if (!tab.classList.contains('active')) tab.click();
        await wait(() => {
            var current = textTab(doc, selector, text);
            return current && current.classList.contains('active');
        }, `切换“${text}”超时`, restoring);
    };
    var printOpen = () => !!doc.querySelector('.print-btn .ppt-list');
    var setPrintOpen = async (open, restoring = false) => {
        check(restoring);
        if (printOpen() === open) return;
        var trigger = doc.querySelector('.print-btn > span');
        // 没有下拉箭头时单击会直接打印，不能用来探测分组。
        if (!trigger || !trigger.querySelector('.icon-jiantoudan-xiangxia,.icon-jiantoudan-xiangshang')) {
            throw new Error('无法可靠识别课件划分：打印菜单开关不可用');
        }
        trigger.click();
        await wait(() => printOpen() === open, '等待打印课件菜单超时', restoring);
    };
    var original = { tab: activeText(doc, TABS), filter: activeText(doc, FILTERS), detail: detailImage(doc), printOpen: printOpen(),
        scroll: Array.from(doc.querySelectorAll('*')).filter(el => el.scrollTop || el.scrollLeft)
            .map(el => ({ el, top: el.scrollTop, left: el.scrollLeft, className: el.className })) };
    var previousRow = -1;
    var touchedDetails = false;
    var failure;
    try {
        progress('整理课件…');
        await select(TABS, '课件');
        await select(filtersFor('课件'), '全部');
        var last = '', stableAt = Date.now();
        await wait(() => {
            var images = Array.from(doc.querySelectorAll('.slide-detail-wrap .slide-list > .slide-item .slide-img img'));
            var signature = images.map(img => img.getAttribute('data-src') || img.getAttribute('src')).join('|');
            if (signature !== last){ last = signature; stableAt = Date.now(); }
            return images.length && Date.now() - stableAt >= 500;
        }, '完整课件加载超时');
        var slides = reportSlides(doc);
        var coursewares;
        if (withCoursewares){
            var print = await wait(() => doc.querySelector('.print-btn'), '等待打印课件按钮超时');
            if (print.querySelector('.icon-jiantoudan-xiangxia,.icon-jiantoudan-xiangshang')){
                await setPrintOpen(true);
                await wait(() => doc.querySelector('.print-btn .ppt-list-item'), '打印课件列表加载超时');
            }
            coursewares = reportCoursewares(doc, slides, context.filename.replace(/\.pdf$/i, ''));
            if (!original.printOpen) await setPrintOpen(false);
        }
        var answers = [];
        if (withAnswers){
            await wait(() => {
                var heading = Array.from(doc.querySelectorAll('.container-header'))
                    .find(node => nodeText(node).startsWith('课堂习题'));
                var count = heading && nodeText(heading).match(/[（(]\s*(\d+)\s*[）)]/);
                var rows = doc.querySelectorAll(ROWS);
                if (count) return rows.length === Number(count[1]);
                // 无习题的报告不渲染习题区；等待已完成的个人统计/心得区作为就绪标记。
                return !heading && !rows.length && doc.querySelector('.stats-cmp-wrap .info-stats') &&
                    nodeText(doc.querySelector('.stats-cmp-wrap')).includes('学习心得');
            }, '习题总览未完整加载，请稍后重试');
            var rows = Array.from(doc.querySelectorAll(ROWS));
            for (let i = 0; i < rows.length; i++){
                check();
                progress(`收集答案(${i + 1}/${rows.length})`);
                touchedDetails = true;
                await openDetail(i);
                var answerSignature = '', answerAt = Date.now();
                var answer = await wait(() => {
                    var result = doc.querySelector(`${DETAIL} .result-box`);
                    var ans = result && result.textContent.includes('正确答案') && nodeText(result.querySelector('.res-text'));
                    var key = detailImage(doc);
                    var signature = JSON.stringify([key, ans]);
                    if (signature !== answerSignature){ answerSignature = signature; answerAt = Date.now(); }
                    return key && ans && Date.now() - answerAt >= 200 ? { key, ans } : null;
                }, `第 ${i + 1} 道习题未提供正确答案或加载超时，可关闭“课件附答案”后重试`);
                if (answer.key === original.detail) previousRow = i;
                matchAnswer(slides, answers, answer.key, answer.ans);
            }
        }
        return { filename: context.filename, slides, answers, coursewares };
    } catch (err) {
        failure = err;
        throw err;
    } finally {
        if (sameReport()){
            var restoreErrors = [];
            try {
                if (touchedDetails){
                    await closeDetail(true);
                    if (original.detail){
                        // 从已展开的详情启动且尚未遍历到该题时，也恢复它。
                        if (previousRow < 0){
                            for (let i = 0; i < doc.querySelectorAll(ROWS).length; i++){
                                await openDetail(i, true);
                                if (detailImage(doc) === original.detail){ previousRow = i; break; }
                            }
                        }
                        if (previousRow < 0) throw new Error('无法恢复原习题详情');
                        await openDetail(previousRow, true);
                    }
                }
            } catch (err) {
                restoreErrors.push(err.message);
            }
            try {
                await select(TABS, original.tab, true);
                await select(filtersFor(original.tab), original.filter, true);
                if (withCoursewares) await setPrintOpen(original.printOpen, true);
                for (let saved of original.scroll){
                    let el = saved.el.isConnected ? saved.el : Array.from(doc.querySelectorAll('[class]'))
                        .find(node => node.className === saved.className);
                    if (el){ el.scrollTop = saved.top; el.scrollLeft = saved.left; }
                }
            } catch (err) {
                restoreErrors.push(err.message);
            }
            if (restoreErrors.length){
                var message = `视图恢复失败：${restoreErrors.join('；')}`;
                if (failure) failure.message += `；${message}`;
                else throw new Error(message);
            }
        }
    }
}
