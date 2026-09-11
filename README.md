# 雨课堂课件PDF下载工具

**在雨课堂页面自动生成PDF版本课件提供下载**

原版：[Github](https://github.com/PillarsZhang/Rain-Classroom-PDF-Direct-Download)[^1] [Greasy Fork](https://greasyfork.org/scripts/424050)

## 注意 / Attention

推送到 Greasy Fork 的代码进行了 webpack 无压缩打包，所有源代码都可以在 [Github](https://github.com/Nanboom233/yuketang_pdf) 上找到！

The code pushed to Greasy Fork this time is packaged by webpack without compression. All the source code can be found on [Github](https://github.com/Nanboom233/yuketang_pdf)!

## 简介

雨课堂虽然有原生的打印功能，但是存在设置页面、拉伸图像、打印PDF等各种麻烦。于是乎自己给雨课堂加了个按钮，该脚本能够自动生成课件的PDF版本，只需要点击一下~

![Rain-Classroom-PDF-Direct-Download-Screenshot-1](./docs/images/screenshot_pizyds_rain_v1.3.0.png)

## 安装与反馈

- 安装链接：[https://greasyfork.org/scripts/595311](https://greasyfork.org/scripts/595311)
- Github：[https://github.com/Nanboom233/yuketang_pdf](https://github.com/Nanboom233/yuketang_pdf)

## 使用说明

适配了 [雨课堂网页版 v2](https://www.yuketang.cn/v2/web) 和 [新版页面](https://www.yuketang.cn/v2/web/student-lesson-report/)，关键更新如下

- *1.0.6* 版本修改了链接匹配，理论上也能支持其它分区域雨课堂，如荷塘、长江、黄河
- *1.1.0* 版本逆天地支持插入客观题答案，支持点击 `[ 答案 ]` 按钮来开启或关闭
- *1.2.0* 支持发布类型为“课件”（区别于“课堂”）类型的PPT的下载(Beta)
- *1.2.2* ~~为了尊重版权与脚本的和平发展，PDF 中将默认加密注入 DRM 信息，详情参考[说明](https://www.pizyds.com/rain-classroom-pdf-direct-download-pizyds-rain-drm/)~~[^3]
- *1.3.0* 加入了漂亮的配置界面，支持改变答案字体，拥有非常给力的用户体验
- *1.3.1* 优化了生成速度、报错信息，修复了图片格式兼容、面板不刷新的Bug
- *1.3.2* 外部库依赖改为 ~~专用百度智能云 CDN~~ 国内的 [75CDN](https://cdn.baomitu.com/)，增加校验参数与开发时的校验比对脚本
- *1.3.3* 升级 jsPDF 至 4.2.1，普通 JPEG 保留原图直接嵌入，其他图片采用带透明度的无损转换；保留旧浏览器和特殊图片的 PNG 回退。
- *1.3.4* 支持新版课堂报告页：在标题栏选择课件，按实际划分提供单份下载和全部分别下载，并自动附加习题正确答案；保留旧版图片和 HTML 课件兼容。
- *1.3.5* 旧版课堂页面自动等待习题并附加答案，采集失败时提示重试，下载后恢复页面状态。
- *1.4.0* 移除 DRM 设置和 PDF 元数据注入，改为版权提醒；更新项目维护信息与 GitHub 地址

该脚本将前端技术最大化，分析当前页面的 DOM ，完全在本地浏览器内处理，不发送任何无关请求，所使用的外部库均开源且引用自公共 CDN ~~和 NPM~~[^2]，进行 webpack 压缩打包以求高效。

- [jsPDF](https://github.com/MrRio/jsPDF) 用于 PDF 的生成
- [html2canvas](https://github.com/niklasvh/html2canvas) 将“课件”类型 PPT 的 HTML 内容转换为位图（很坑）
- [Bootstrap](https://getbootstrap.com) UI 样式库，主要使用了 Popovers 插件以及图标库

另外请大家注意版权问题，下载的 PDF 自行使用不要随意发布~

[^1]: 继承了原版并继续支持维护： https://github.com/PillarsZhang/Rain-Classroom-PDF-Direct-Download/pull/6

[^2]: 为了弥补安全上的可信度，这次更新同时增加了对外部库的 SHA256 校验：一是 Tampermonkey 在 @require 阶段的校验；二是开发阶段对不同 CDN 来源各个外部库的[校验比对](./build/tampermonkey/requires_hash.json)，保证专用 CDN 资源与公共的一致性。

[^3]: [在授意下移除](https://github.com/PillarsZhang/Rain-Classroom-PDF-Direct-Download/pull/6#issuecomment-5623065521)， 改为直接添加版权声明
