//运行环境配置
export var env_config = {
    _version: "0.0.0",
    log: {
        config: false
    }
}
autoGMValue(env_config, "env_config");

//编译信息
export var build_info = {
    name: window.PIZYDS_RAIN.NAME,
    version: window.PIZYDS_RAIN.VERSION,
    timestamp: window.PIZYDS_RAIN.TIMESTAMP,
}

//对自动添加客观题答案到PPT页面的配置
export var ans_config = {
    _enabled: true,
    _fontSize: 40,
    right: 30,
    up: 20,
    fontColor: "#000000",
    text: {
        enabled: "课件附答案",
        fontSize: "答案字号"
    }
};
autoGMValue(ans_config, "ans_config");

//网址分类规则
export var url_match = [{
    reg: /https:\/\/.*\.yuketang\.cn\/v2\/web\/student\/.*/,
    type: 1
},{
    reg: /https:\/\/.*\.yuketang\.cn\/v2\/web\/student-v3\/.*/,
    type: 1
},{
    reg: /https:\/\/.*\.yuketang\.cn\/v2\/web\/studentCards\/.*/,
    type: 2
}];

env_config.log.config = true;

function autoGMValue(obj, objName){
    for (let keyTemp in obj){
        if (keyTemp.startsWith('_')){
            let _key = keyTemp; //内置值
            let key = _key.substring(1); //操作值
            let $key = '$' + key; //默认值
            let GMValueName = `${objName}.${key}`;
            obj[$key] = obj[_key];
            Object.defineProperty(obj, key, {
                set: function(val) {
                    this[_key] = val;
                    GM_setValue(GMValueName, this[_key]);
                    env_config.log.config && console.log(`雨课堂课件PDF下载工具：${this.text&&this.text[key]||GMValueName} - ${this[_key]}`);
                },
                get: function() {
                    this[_key] = GM_getValue(GMValueName, this[_key]);
                    return this[_key];
                },
            });
            refreshGMValue(obj, key);
        }
    }
}

function refreshGMValue(obj, key){
    obj[key] = obj[key].valueOf();
}

export var time_object = {
    popover_can_hide: Date.now()
}

var update_info_list = {
    '1.4.0': `移除 DRM 设置、RSA/AES 加密、PDF 元数据注入及相关依赖，改为显示版权提醒；同步更新项目维护信息与 GitHub 地址`,
    '1.3.5': `旧版课堂页面支持自动等待习题并附加答案，采集失败时提示重试，下载后恢复页面状态`,
    '1.3.4': `支持新版课堂报告页，按实际课件提供单份下载和全部分别下载，自动附加习题答案，保留旧版兼容`,
    '1.3.3': `优化图片与 PDF 生成速度，升级 jsPDF，保留特殊图片及旧浏览器的转换回退`,
    '1.3.1': `优化了生成速度、报错信息，修复了图片格式兼容、面板不刷新的Bug`,
    '1.3.2': `外部库依赖改为国内的 75CDN，增加校验参数与开发时的校验比对脚本`
}

export var update_info = update_info_list[build_info.version] ? 
  update_info_list[build_info.version] : 
  '好像没有更新信息';
