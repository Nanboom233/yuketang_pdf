import { imageKey } from './page_adapter.js';

/**
 * 获取客观题答案
 * @param url_slides PPT URL 列表
 * @return {Promise<Array>} 答案列表
 */
export default async function get_answers(url_slides, { el_dialog, checkActive = () => {}, progress = () => {}, timeout = 15000 } = {}){
    var doc = el_dialog ? el_dialog.ownerDocument : document;
    var root = el_dialog && el_dialog.closest('.student__learning__component') || doc;
    var main = root.querySelector('.student_learn_main');
    var scroll = Array.from(new Set([doc.scrollingElement, main, ...root.querySelectorAll('*')]))
        .filter(el => el && (el === doc.scrollingElement || el === main || el.scrollTop || el.scrollLeft))
        .map(el => ({ el, top: el.scrollTop, left: el.scrollLeft }));
    var start = Date.now(), signature = '', stableAt = start, scrolled = false;
    var el_exercises_info;
    try {
        progress('收集答案…');
        while (Date.now() - start < timeout){
            checkActive();
            let el_problem = root.querySelector('#problem');
            let heading = el_problem && el_problem.querySelector('.exercises_total');
            let count = heading && heading.textContent.match(/共\s*(\d+)\s*题/);
            let rows = el_problem ? Array.from(el_problem.querySelectorAll('.exercises_info')) : [];
            let empty = main && main.textContent.includes('本次授课无习题');
            let ready = count ? rows.length === Number(count[1]) : empty && !rows.length;
            let values = rows.map(el => {
                let img = el.querySelector('.img_box>img');
                let ans = el.querySelector('.answer_info>.correct_answer');
                return [img && img.getAttribute('src'), ans && ans.textContent.trim()];
            });
            ready = ready && values.every(([url, ans]) => url && !url.startsWith('data:') && ans && ans.replace(/^答案\s*[:：]\s*/, '').trim());
            let current = JSON.stringify([count && count[1], !!empty, values]);
            if (!ready || current !== signature){ signature = current; stableAt = Date.now(); }
            if (ready && Date.now() - stableAt >= 200){ el_exercises_info = rows; break; }
            if (!scrolled && !ready){
                if (el_problem) el_problem.scrollIntoView({ block: 'end', behavior: 'instant' });
                else if (main) main.scrollIntoView({ block: 'end', behavior: 'instant' });
                if (main) main.scrollTop = main.scrollHeight;
                scrolled = !!(el_problem || main);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        checkActive();
        if (!el_exercises_info) throw new Error('习题或正确答案未完整加载，可重试或关闭“课件附答案”后下载');
    } finally {
        // 报告切换后不再恢复旧页面的滚动位置。
        try {
            checkActive();
            for (let saved of scroll) if (saved.el.isConnected){ saved.el.scrollTop = saved.top; saved.el.scrollLeft = saved.left; }
        } catch (err) { /* 下载入口报告失效原因。 */ }
    }
    var answer_list = [];
    var keys = url_slides.map(url => imageKey(url, doc.baseURI));
    if (el_exercises_info){
        for (let i = 0; i < el_exercises_info.length; i++){
            let el_url = el_exercises_info[i].querySelector(".img_box>img");
            let el_ans = el_exercises_info[i].querySelector(".answer_info>.correct_answer");
            var answer_item = { url: el_url ? el_url.src : "", ans: el_ans ? el_ans.innerText : "", index: -1 };
            let key = imageKey(answer_item.url, doc.baseURI);
            for (let index = 0; index < url_slides.length; index++){
                if (url_slides[index] !== answer_item.url && keys[index] !== key) continue;
                let old = answer_list.find(item => item.index === index);
                if (old && old.ans !== answer_item.ans) throw new Error(`第 ${index + 1} 页出现冲突答案，请刷新报告后重试`);
                if (!old) answer_list.push({ ...answer_item, index });
            }
        }
    }
    console.groupCollapsed(`雨课堂课件PDF下载工具：提取到 ${answer_list.length} 项答案`);
    console.table(answer_list);
    console.groupEnd();
    return answer_list;
}