import { jsPDF } from 'jspdf';

// 此适配层依赖 processRGBA 的返回结构和 putImage 的 sMask 约定。
// 版本不匹配时保留公开的 PNG API，不能静默使用未经验证的内部接口。
const ADAPTER_VERSION = '4.2.1';

export function canPrepareFlate(){
    return jsPDF.version === ADAPTER_VERSION &&
        typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' &&
        typeof Blob === 'function' && typeof Blob.prototype.stream === 'function' &&
        typeof Response === 'function';
}

async function deflate(bytes){
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * 读取像素仅用于本页编码，不与 PNG 或整份课件的 RGBA 列表同时保存。
 * RGB 和 alpha 分别无损压缩；完全不透明时省略遮罩。
 */
export async function canvasToPdfImage(canvas){
    if (canPrepareFlate()){
        try {
            var pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            var count = canvas.width * canvas.height;
            var rgb = new Uint8Array(count * 3);
            var alpha = new Uint8Array(count);
            var opaque = true;
            for (let i = 0, j = 0; i < pixels.length; i += 4){
                rgb[j++] = pixels[i];
                rgb[j++] = pixels[i + 1];
                rgb[j++] = pixels[i + 2];
                alpha[i / 4] = pixels[i + 3];
                if (pixels[i + 3] !== 255) opaque = false;
            }
            pixels = null;
            var [data, mask] = await Promise.all([deflate(rgb), opaque ? null : deflate(alpha)]);
            return { kind: 'flate', width: canvas.width, height: canvas.height, data, mask };
        } catch (err) {
            // 压缩接口缺失、初始化失败等仍可使用原有无损 PNG 路径。
        }
    }
    return { kind: 'PNG', width: canvas.width, height: canvas.height, data: canvas.toDataURL('image/png') };
}

async function flateToPng(image){
    var inflate = async bytes => {
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    };
    var [rgb, alpha] = await Promise.all([inflate(image.data), image.mask ? inflate(image.mask) : null]);
    var canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    try {
        var ctx = canvas.getContext('2d');
        var pixels = ctx.createImageData(image.width, image.height);
        for (let i = 0, j = 0; i < pixels.data.length; i += 4){
            pixels.data[i] = rgb[j++];
            pixels.data[i + 1] = rgb[j++];
            pixels.data[i + 2] = rgb[j++];
            pixels.data[i + 3] = alpha ? alpha[i / 4] : 255;
        }
        ctx.putImageData(pixels, 0, 0);
        return canvas.toDataURL('image/png');
    } finally {
        canvas.width = canvas.height = 0;
    }
}

/** 把预压缩图像交给当前 doc，绝不修改 jsPDF 全局插件。 */
export async function addPdfImage(doc, image, options){
    if (image.kind !== 'flate'){
        doc.addImage({ ...options, imageData: image.data, format: image.kind, compression: 'FAST' });
        return;
    }
    if (jsPDF.version !== ADAPTER_VERSION || typeof doc.processRGBA !== 'function' ||
        !doc.__addimage__ || typeof doc.__addimage__.arrayBufferToBinaryString !== 'function'){
        doc.addImage({ ...options, imageData: await flateToPng(image), format: 'PNG', compression: 'FAST' });
        return;
    }

    var original = doc.processRGBA;
    var toBinary = bytes => doc.__addimage__.arrayBufferToBinaryString(bytes);
    var prepared = {
        data: toBinary(image.data), filter: 'FlateDecode', predictor: 1,
        colorSpace: 'DeviceRGB', bitsPerComponent: 8, width: image.width, height: image.height
    };
    if (image.mask) prepared.sMask = toBinary(image.mask);
    // 显式 alias 避免对占位 RGBA 数据做哈希，导致不同页面复用同一图像。
    var images = doc.internal.collections.addImage_images || {};
    var alias = `pizyds-flate-${Object.keys(images).length}`;
    doc.processRGBA = (unused, index, imageAlias) => ({ ...prepared, index, alias: imageAlias });
    try {
        doc.addImage({ ...options, imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 }, format: 'RGBA', alias });
    } finally {
        doc.processRGBA = original;
    }
}
