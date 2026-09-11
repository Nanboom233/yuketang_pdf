import { jsPDF } from 'jspdf';
import { refreshProcessStatus, text2img, sleep } from './public.js';
import { ans_config } from './common.js';
import { addPdfImage } from './pdf_image.js';

/**
 * 借助jsPDF，进行PDF的生成
 * @param img_list 图片列表
 * @param filename 保存的文件名
 * @param answer_list 答案列表
 * @return {Promise}
 */
export default async function(img_list, filename, answer_list, { checkActive = () => {}, answerConfig = ans_config } = {}){
    checkActive();
    console.groupCollapsed("雨课堂课件PDF下载工具：生成PDF...");
    var doc = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [img_list[0].width, img_list[0].height],
        hotfixes: ["px_scaling"]
    });
    for (let i = 0; i < img_list.length; i++){
        checkActive();
        i > 0 && doc.addPage([img_list[i].width, img_list[i].height], "landscape");
        await addPPT(i, doc, img_list, answer_list, answerConfig);
        refreshProcessStatus(`生成PDF(${i+1}/${img_list.length})`);
        await sleep(10);
    }
    console.groupEnd();
    checkActive();
    doc.save(filename);
    console.log(`雨课堂课件PDF下载工具：完成下载`);
    console.log(`雨课堂课件PDF下载工具：https://www.pizyds.com/rain-classroom-pdf-direct-download/`);
}

/**
 * 附加 PPT 页面
 * @param {number} index
 * @param {jsPDF} doc jsPDF 对象
 * @param {Array} answer_list 答案列表
 * @return {Promise}
 */
async function addPPT(index, doc, img_list, answer_list, ans_config){
    console.log(`雨课堂课件PDF下载工具：第 ${index+1} 页 - PPT`);
    await addPdfImage(doc, img_list[index], {
        x: 0,
        y: 0,
        width: img_list[index].width,
        height: img_list[index].height
    });
    if (ans_config.enabled){
        let answer_item = answer_list.find(obj => obj.index == index);
        if (answer_item && answer_item.ans != "") {
            let answer_img = text2img(answer_item.ans, ans_config.fontSize, ans_config.fontColor);
            console.log(`雨课堂课件PDF下载工具：第 ${index+1} 页 - 答案 - ${answer_item.ans}`);
            await addPdfImage(doc, answer_img, {
                x: img_list[index].width - answer_img.width - ans_config.right,
                y: ans_config.up,
                width: answer_img.width,
                height: answer_img.height
            });
        }
    }
}
