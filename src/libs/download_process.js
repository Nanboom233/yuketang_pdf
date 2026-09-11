import get_url_slides from './get_url_slides.js';
import image_process from './image_process.js';
import pdf_process from './pdf_process.js';
import get_html_slides from './get_html_slides.js';
import html2canvas_hd from './html2canvas_hd.js';
import get_answers from './get_answers.js';
import { refreshProcessStatus, refreshHeaderMessage, sleep } from './public.js';
import { ans_config } from './common.js';

var active_downloads = new WeakSet();

/**
 * 按钮触发PDF生成逻辑
 * @param el_dialog 整体 dialog DOM 对象
 * @param url_type URL 类型
 * @return {void}
 */
export default function (el_dialog, url_type = 1){
    var type_fun = [{
        type: 0,
        fun: () => {
            console.log(`雨课堂课件PDF下载工具：PDF生成逻辑未知错误 - type ${url_type}`);
            return false;
        }
    },{
        type: 1,
        fun: async () => {
            if (active_downloads.has(el_dialog)) return;
            var url_slides = get_url_slides(el_dialog);
            if (url_slides.length > 0){
                active_downloads.add(el_dialog);
                var identity = location.href;
                var checkActive = () => {
                    if (location.href !== identity || !el_dialog.isConnected || !el_dialog.getClientRects().length){
                        throw new Error('报告或课件已关闭或切换，已取消下载');
                    }
                };
                var settings = { checkActive, answerConfig: { ...ans_config, enabled: ans_config.enabled, fontSize: ans_config.fontSize } };
                var buttons = Array.from(el_dialog.querySelectorAll('#pizyds_rain_download_button, #pizyds_rain_config_button'))
                    .map(el => ({ el, disabled: el.disabled }));
                buttons.forEach(({ el }) => { el.disabled = true; });
                try {
                    checkActive();
                    var ppt_name = (el_dialog.closest('.module_ppt') || el_dialog.ownerDocument).querySelector('.ppt_name');
                    var filename = (ppt_name && ppt_name.innerText.trim() || '雨课堂课件') + '.pdf';
                    var answer_list = settings.answerConfig.enabled ? await get_answers(url_slides, { el_dialog, checkActive, progress: refreshProcessStatus }) : [];
                    var img_list = await image_process(url_slides, { checkActive, showErrors: false });
                    refreshProcessStatus("生成PDF...");
                    await sleep(200);
                    await pdf_process(img_list, filename, answer_list, settings);
                } catch (err) {
                    console.error(err);
                    if (location.href === identity && el_dialog.isConnected) refreshHeaderMessage(err.message, 'Warn');
                } finally {
                    active_downloads.delete(el_dialog);
                    buttons.forEach(({ el, disabled }) => { if (el.isConnected) el.disabled = disabled; });
                    if (location.href === identity && el_dialog.isConnected) refreshProcessStatus(false);
                }
            } else{
                refreshProcessStatus(false);
                refreshHeaderMessage("没有提取到图片", 'Warn');
            }
        }
    },{
        type: 2,
        fun: () => {
            var html_slides = get_html_slides(el_dialog);
            if (html_slides){
                refreshProcessStatus("处理HTML...");
                //HTML转图片
                return html2canvas_hd().then(async img_list => {
                    refreshProcessStatus("生成PDF...");
                    await sleep(200);
                    var ppt_name = document.getElementsByClassName("ppt_name")[0].innerText;
                    var filename = ppt_name + ".pdf";
                    var answer_list = [];
                    await pdf_process(img_list, filename, answer_list).catch(err => {
                        console.error(err);
                        refreshProcessStatus(false);
                        refreshHeaderMessage("PDF生成出错", 'Warn');
                        throw err;
                    });
                    refreshProcessStatus(false);
                }).catch(err => {
                    console.error(err);
                    refreshProcessStatus(false);
                });
            } else{
                refreshProcessStatus(false);
                refreshHeaderMessage("没有提取到图片", 'Warn');
            }
        }
    }];
    return type_fun.find(value => value.type == url_type).fun();
}
