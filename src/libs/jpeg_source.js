/**
 * 只允许无需浏览器旋转/色彩校正的 8-bit RGB JPEG 直嵌。
 * 不以扩展名或 Content-Type 判断；未知 APP 标记也回退到 Canvas。
 */
export function getDirectJpegSize(bytes){
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
        bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;

    var offset = 2;
    var size = null;
    var jfif = false;
    var scanning = false;
    var scanned = false;
    while (offset < bytes.length){
        if (scanning){
            while (offset < bytes.length && bytes[offset] !== 0xff) offset++;
        }
        if (bytes[offset++] !== 0xff) return null;
        while (bytes[offset] === 0xff) offset++;
        var marker = bytes[offset++];
        if (scanning && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
        scanning = false;
        if (marker === 0xd9) return offset === bytes.length && jfif && scanned ? size : null;
        if (offset + 2 > bytes.length) return null;
        var length = bytes[offset] * 256 + bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length) return null;

        // APP1/APP2/APP14 等可能包含 EXIF、ICC、Adobe 色彩变换。
        if (marker >= 0xe0 && marker <= 0xef){
            if (marker !== 0xe0 || length < 16 ||
                String.fromCharCode(...bytes.subarray(offset + 2, offset + 7)) !== 'JFIF\0') return null;
            jfif = true;
        } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)){
            if (![0xc0, 0xc2].includes(marker) || length !== 17 || bytes[offset + 2] !== 8 ||
                bytes[offset + 7] !== 3 || size) return null;
            // 普通 JFIF 使用 1/2/3 分量；RGB 标记等不明确的情况交给浏览器。
            if (bytes[offset + 8] !== 1 || bytes[offset + 11] !== 2 || bytes[offset + 14] !== 3) return null;
            size = {
                width: bytes[offset + 5] * 256 + bytes[offset + 6],
                height: bytes[offset + 3] * 256 + bytes[offset + 4]
            };
            if (!size.width || !size.height) return null;
        } else if (marker === 0xda){
            if (!size) return null;
            scanning = scanned = true;
        } else if (![0xc4, 0xdb, 0xdd, 0xfe].includes(marker)){
            return null;
        }
        offset += length;
    }
    return null;
}

/** 获取字节失败不能阻断原有 Image 加载路径。 */
export async function fetchImageBytes(url){
    if (typeof fetch !== 'function' || typeof AbortController !== 'function') return null;
    var controller = new AbortController();
    var timeout = setTimeout(() => controller.abort(), 5000);
    try {
        var response = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) return null;
        return new Uint8Array(await response.arrayBuffer());
    } catch (err) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
