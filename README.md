# 鑫汇盈股票看板

## 三入口部署

- 腾讯云普通版 `/`：普通话术生成器与持仓看板，页面不展示“固定规则”字样。
- 腾讯云智能版 `/ai`：DeepSeek Flash 智能话术生成器与持仓看板。
- 腾讯云双模式版 `/all`：同一页面可在普通话术与 DeepSeek 智能话术之间切换。
- Cloudflare Workers 仍保留为备用的 DeepSeek 独立入口。

各入口共用行情、企业主营资料和持仓界面代码；DeepSeek API Key 必须使用 Worker Secret 或腾讯云服务器环境变量配置，禁止提交到 GitHub。

一个面向 A 股的轻量持仓看板，包含智能话术生成器、多自选组合、股票代码与名称自动匹配、实时行情及当日涨幅展示。

在线访问：<https://xinhuiying-stock-dashboard.jessiegao2526.workers.dev>

GitHub Pages 入口：<https://jessiegao2526.github.io/jessie/>

> `workers.dev` 在部分中国大陆网络中可能受到 DNS 污染或访问不稳定。面向国内用户长期分享时，建议在 Cloudflare 中绑定自己的域名。

## 主要功能

- 输入股票名称或 6 位代码自动匹配证券
- 根据公司主营业务与产业方向生成一句话逻辑
- 一键加入已有组合，或新建自选组合
- 同一股票可在不同组合中设置不同成本价
- 展示现价、持仓收益与当日涨幅
- 数据保存在当前浏览器本地，无需注册登录

## 本地运行

需要 Node.js 22.13 或更高版本，以及 pnpm。

```bash
pnpm install
pnpm dev
```

## 构建与发布

```bash
pnpm build
pnpm deploy
```

生产环境运行于 Cloudflare Workers，公开地址无需登录。配置见 [`wrangler.jsonc`](./wrangler.jsonc)。

## 数据说明

行情、证券搜索和公司资料来自公开行情接口，可能存在延迟或临时不可用。页面生成内容仅用于信息整理，不构成任何投资建议。
