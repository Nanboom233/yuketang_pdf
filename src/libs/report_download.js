import $ from 'jquery';
import conf_panel from './conf_panel.js';
import { reportContext, collectReport, coursewareSignature, coursewareContent } from './page_adapter.js';
import { refreshProcessStatus, refreshHeaderMessage } from './public.js';
import { ans_config, drm_config } from './common.js';
import image_process from './image_process.js';
import pdf_process from './pdf_process.js';
import downloadIcon from 'bootstrap-icons/icons/file-earmark-pdf.svg';
import configIcon from 'bootstrap-icons/icons/gear-fill.svg';

/** 顶层挂载；iframe 自己运行 userscript 时不会重复注入。 */
export default function startReportDownload(){
    if (window.top !== window) return;
    var mounted, task, observerTimer;
    var unmount = () => {
        if (task) task.abort();
        if (!mounted) return;
        $(mounted.root.querySelector('#pizyds_rain_config_button')).popover('dispose');
        $(mounted.root).off('.pizydsRain');
        $('html').off('.pizydsRain');
        mounted.frame.removeEventListener('load', schedule);
        document.removeEventListener('click', mounted.dismiss);
        if (mounted.content) mounted.content.removeEventListener('click', mounted.dismiss);
        mounted.header.classList.remove('pizyds-report-header');
        mounted.root.remove();
        mounted = null;
    };
    var mount = context => {
        var root = document.createElement('div');
        root.className = 'pizyds_rain pizyds-report-controls';
        root.innerHTML = `<div id="pizyds_rain_waiting">
            <button type="button" id="pizyds_rain_download_button" title="下载课件" aria-label="下载课件">${downloadIcon}<span class="pizyds-download-label">下载课件</span></button>
            <button type="button" id="pizyds_rain_config_button" title="下载配置" aria-label="下载配置">${configIcon}</button>
            </div><span id="pizyds_rain_running" hidden role="status"><span id="pizyds_rain_batch_status"></span><span id="pizyds_rain_running_text"></span><button type="button" id="pizyds_rain_cancel">取消</button></span>
            <section class="pizyds-courseware-list" hidden aria-label="选择下载课件"><strong>选择下载课件</strong><p class="pizyds-courseware-notice" role="status"></p><div class="pizyds-courseware-items"></div><button type="button" data-download="all">全部分别下载</button></section>`;
        var oldButton = context.header.querySelector('.old-version-btn');
        var right = oldButton && oldButton.parentElement;
        if (!right) return;
        right.prepend(root);
        context.header.classList.add('pizyds-report-header');
        var configButton = root.querySelector('#pizyds_rain_config_button');
        var downloadButton = root.querySelector('#pizyds_rain_download_button');
        var chooser = root.querySelector('.pizyds-courseware-list');
        var batchStatus = root.querySelector('#pizyds_rain_batch_status');
        var cancelButton = root.querySelector('#pizyds_rain_cancel');
        var catalog;
        var hideChooser = () => { chooser.hidden = true; downloadButton.setAttribute('aria-expanded', 'false'); };
        var showChooser = (message = '') => {
            var items = chooser.querySelector('.pizyds-courseware-items');
            items.textContent = '';
            catalog.coursewares.forEach((group, index) => {
                var row = document.createElement('div');
                row.className = 'pizyds-courseware-item';
                var label = document.createElement('span');
                label.textContent = `${group.title}（${group.pageCount} 页）`;
                var button = document.createElement('button');
                button.type = 'button';
                button.dataset.download = index;
                button.textContent = '下载';
                button.setAttribute('aria-label', `下载 ${group.title}`);
                row.append(label, button);
                items.appendChild(row);
            });
            chooser.querySelector('.pizyds-courseware-notice').textContent = message;
            chooser.hidden = false;
            downloadButton.setAttribute('aria-expanded', 'true');
        };
        downloadButton.setAttribute('aria-expanded', 'false');
        var dismiss = event => { if (!root.contains(event.target)) hideChooser(); };
        conf_panel($(configButton), root);
        $(configButton).on('show.bs.popover', hideChooser);
        root.addEventListener('keydown', event => { if (event.key === 'Escape') hideChooser(); });
        document.addEventListener('click', dismiss);
        if (context.frame.contentDocument) context.frame.contentDocument.addEventListener('click', dismiss);
        context.frame.addEventListener('load', schedule);
        mounted = { ...context, root, dismiss, content: context.frame.contentDocument };
        var run = async selection => {
            if (task) return;
            hideChooser();
            var current = mounted;
            var controller = new AbortController();
            task = controller;
            var content = current.frame.contentDocument;
            var checkActive = () => {
                if (controller.signal.aborted || mounted !== current || current.document.location.pathname !== current.identity ||
                    !current.frame.isConnected || current.frame.contentDocument !== content){
                    throw new Error('已取消下载或报告已切换');
                }
            };
            var overlay = document.createElement('div');
            overlay.className = 'pizyds-report-overlay';
            overlay.innerHTML = '<div role="status">正在整理课件，请稍候…</div><button type="button">取消下载</button>';
            document.body.appendChild(overlay);
            var placeOverlay = () => {
                var rect = current.frame.getBoundingClientRect();
                Object.assign(overlay.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
            };
            placeOverlay();
            window.addEventListener('resize', placeOverlay);
            window.addEventListener('scroll', placeOverlay, true);
            overlay.querySelector('button').onclick = () => controller.abort();
            cancelButton.onclick = () => controller.abort();
            var progress = text => {
                checkActive();
                refreshProcessStatus(text);
                overlay.querySelector('[role=status]').textContent = text;
            };
            $(configButton).popover('hide');
            root.querySelectorAll('button').forEach(button => { button.disabled = true; });
            cancelButton.disabled = false;
            batchStatus.textContent = '';
            var settings = { answerConfig: { ...ans_config, enabled: ans_config.enabled, fontSize: ans_config.fontSize },
                drmConfig: { enabled: drm_config.enabled }, checkActive };
            var failed = false;
            var completed = 0, selectedCount = 0, activeGroup;
            try {
                checkActive();
                current.filename = reportContext().filename;
                refreshHeaderMessage(false);
                var result = await collectReport(current, { withCoursewares: true,
                    withAnswers: selection !== null && settings.answerConfig.enabled, signal: controller.signal, progress });
                checkActive();
                overlay.remove();
                if (selection === null){ catalog = result; showChooser(); return; }
                if (!catalog || coursewareSignature(catalog) !== coursewareSignature(result)){
                    catalog = result;
                    showChooser('课件内容已变化，请重新选择下载。');
                    return;
                }
                var groups = selection === 'all' ? result.coursewares : [result.coursewares[selection]];
                selectedCount = groups.length;
                for (let group of groups){
                    activeGroup = group;
                    checkActive();
                    batchStatus.textContent = `${completed + 1}/${selectedCount} ${group.title} · `;
                    batchStatus.title = group.title;
                    let part = coursewareContent(result, group);
                    let images = await image_process(part.slides.map(slide => slide.url), { checkActive, showErrors: false });
                    checkActive();
                    await pdf_process(images, part.filename, part.answers, settings);
                    completed++;
                }
            } catch (err) {
                failed = true;
                console.error('雨课堂课件PDF下载工具：', err);
                var message = err && err.message || '下载失败，请检查图片报错或刷新报告后重试';
                if (activeGroup) message = `已完成 ${completed}/${selectedCount} 份；${activeGroup.title}：${message}`;
                if (mounted === current) refreshHeaderMessage(message, 'Warn', false);
            } finally {
                overlay.remove();
                window.removeEventListener('resize', placeOverlay);
                window.removeEventListener('scroll', placeOverlay, true);
                if (task === controller) task = null;
                if (mounted === current){
                    refreshProcessStatus(false);
                    root.querySelectorAll('button').forEach(button => { button.disabled = false; });
                    if (failed) $(configButton).popover('show');
                }
                update();
            }
        };
        downloadButton.addEventListener('click', () => {
            if (!chooser.hidden) hideChooser();
            else run(null);
        });
        chooser.addEventListener('click', event => {
            var button = event.target.closest('button[data-download]');
            if (button) run(button.dataset.download === 'all' ? 'all' : Number(button.dataset.download));
        });
    };
    var update = () => {
        var context = reportContext();
        if (mounted && (!context || context.identity !== mounted.identity || context.header !== mounted.header ||
            context.frame !== mounted.frame || context.frame.contentDocument !== mounted.content || !mounted.root.isConnected)) unmount();
        if (!mounted && context && !task) mount(context);
    };
    var schedule = () => {
        clearTimeout(observerTimer);
        observerTimer = setTimeout(update, 100);
    };
    var observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    // pushState 不触发 popstate，低频检查还覆盖没有 DOM 变化的 SPA 跳转。
    var interval = setInterval(update, 500);
    window.addEventListener('popstate', schedule);
    window.addEventListener('pagehide', () => {
        unmount();
        observer.disconnect();
        clearInterval(interval);
        clearTimeout(observerTimer);
        window.removeEventListener('popstate', schedule);
    }, { once: true });
    update();
}
