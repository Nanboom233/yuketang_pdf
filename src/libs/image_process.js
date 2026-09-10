import { refreshProcessStatus, refreshHeaderMessage, url2ImgData } from "./public.js";

/**
 * 有界准备图像，避免异步压缩期间同时保留整份课件的 Canvas/像素。
 * @param url_slides 图片链接列表
 * @return {Promise}
 */
export default async function (url_slides, { checkActive = () => {}, showErrors = true } = {}){
    var images = new Array(url_slides.length);
    var finished_num = 0;
    var next_index = 0;
    var failed = false;
    var count_finished_num = (index) => {
        var processStatus = `${++finished_num}/${url_slides.length}`;
        refreshProcessStatus(`处理图片(${processStatus})`);
        console.log(`雨课堂课件PDF下载工具：${processStatus} - 第${index+1}页 - ${url_slides[index]}`);
    }
    var worker = async () => {
        while (!failed && next_index < url_slides.length){
            let i = next_index++;
            try {
                checkActive();
                images[i] = await url2ImgData(url_slides[i]);
                checkActive();
                if (!failed) count_finished_num(i);
            } catch (err) {
                if (!failed){
                    failed = true;
                    checkActive();
                    console.error(err);
                    if (showErrors){
                        refreshProcessStatus(false);
                        refreshHeaderMessage(`图像处理出错（第${i+1}页：${url_slides[i]}）`, 'Warn');
                    }
                    throw new Error(`图像处理出错（第${i+1}页），请检查网络或刷新报告后重试`);
                }
                throw err;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(3, url_slides.length) }, worker));
    return images;
}