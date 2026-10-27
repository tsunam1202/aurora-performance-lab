# AURORA 独立部署与网站集成

这是完整的静态网站，包含首页、精选配件、性能评测、汽车文化和适配服务。`dist/` 中已包含页面、样式、脚本、两个品牌 Logo、赛车与活动图片、60 个配件选型条目及产品图。无需安装 npm 依赖或再次编译。

## 文件与本地预览

```text
dist/                       可直接部署的网站
  index.html                入口
  assets/                   全部图片与 Logo
integration/
  server.cjs                零依赖本地 HTTP 服务
  start-local.cmd           Windows 双击启动并打开浏览器
  start-local.ps1           Windows 启动脚本
  embed-example.html        iframe 集成示例
  README.md                 本说明
  ASSET-SOURCES.json         公开产品来源与素材性质说明
package.json                npm start 命令
```

先完整解压文件。安装 Node.js 20 或更高版本后，在文件夹中运行：

```sh
npm start
# 或指定端口
node integration/server.cjs --port 4180
```

浏览器打开 `http://127.0.0.1:4180/#home`。Windows 也可以双击 `integration/start-local.cmd`，它会在后台启动服务并打开页面；当前电脑已安装的 Codex Node 运行时可作为备用。用命令行启动时，按 Ctrl+C 停止该服务。双击启动的后台服务运行至电脑重启，或在任务管理器中结束对应的 Node 进程。

服务仅监听本机 `127.0.0.1`。更换端口可用 `integration/start-local.cmd -Port 4181`。不要直接双击 `index.html` 作为正式预览方式；请通过本地 HTTP 服务打开。

## 集成到现有网站

推荐保留网站为独立目录，通过 iframe 嵌入，以免现有网站的样式、全局脚本和页面锚点与本模块冲突。

1. 将 `dist/` **里面的全部内容**复制到主站公开目录的 `aurora/`，保留子目录关系。最终入口为 `/aurora/index.html`。
2. 在主站页面加入以下代码，并按主站布局调整高度：

```html
<iframe
  src="/aurora/index.html#home"
  title="AURORA 极光：性能、配件与汽车文化"
  style="display:block;width:100%;height:100vh;min-height:680px;border:0"
  allow="fullscreen">
</iframe>
```

需要查看独立集成示例时，本地打开 `http://127.0.0.1:4180/integration/embed-example.html`。示例里的 `../dist/index.html` 是打包目录的相对路径；部署后应替换为主站上的实际路径。若主站部署在子目录中，也可使用 `./aurora/index.html#home`。

可直接链接五个页面：`#home`、`#shop`、`#lab`、`#community`、`#service`。页面使用哈希路由，不需要服务器路径重写。嵌入模块内部的页面切换不会改变主站路由。不要把模块的 `app.js` 等文件直接注入主站的同一页面。

如果主站启用了 CSP 或 iframe 限制，请允许主站加载本模块所在的域或同源目录。若放在独立域名下，还需由目标服务器允许该主站嵌入。商品来源外链在新标签页打开；联系电话链接交给设备的电话应用处理。

## 独立网站部署

将 `dist/` 设为静态站点的发布目录即可；首页是 `dist/index.html`。所有站内资源使用相对路径，支持域名根目录或 `/aurora/` 子目录。无需本地 Node 服务参与线上运行。

集成包和 GitHub 发布目录不需要 `.openai/`、`.git/`、QA 截图、账号凭据或开发环境文件。源码可在任意普通静态托管服务继续维护。

## 内容维护与功能范围

- 联系人和品牌配置集中在 `dist/site-config.js`：`contact.name` 为张城铭，`contact.phone` 为 `19945612409`；页面中电话可点击拨号。更换品牌 Logo 时修改同一文件中的品牌图片路径，并保留相应图片文件。
- 品牌产品选型数据主要在 `dist/catalog-data.js`；自有方向盘选项及商店组件在 `dist/store-v4.js`；基础三款减振器记录在 `dist/app.js`。
- 车型照片与文化活动素材分别由 `dist/car-data.js`、`dist/culture-data.js` 管理。
- 购物清单、表单草稿保存在访问者当前浏览器；可以导出需求单。网站没有支付、库存管理、自动发送订单或收集表单的后端，接入正式交易系统时需由主站实现这些能力。
- 商品价格为选型参考预算；评测模型计算不代表品牌实测。自有方向盘图为设计概念。产品适配与最终报价应在服务沟通时确认。
- `integration/ASSET-SOURCES.json` 收录 54 个品牌产品的公开来源，以及车队素材、品牌 Logo 和三张 AI 方向盘设计图的性质说明。第三方产品图片及品牌名归相应品牌；来源链接不是可转授的图片授权。把站点用于新增用途时由运营方确认相应使用权限。

网站内置“动效开启/暂停”按钮，并遵循系统的减少动态效果设置。极光、粒子、赛车视角与评测曲线保持原有联动。
