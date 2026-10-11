# Constraint Solver

一个基于 Web 的 CAD 约束求解器应用。

## 项目简介

Constraint Solver 是一个交互式的 CAD 约束求解 Web 应用，支持几何约束的创建、编辑和求解。该项目包含以下主要功能：

- **实体管理**: 支持多种几何实体（点、线、圆等）的创建和选择
- **约束系统**: 提供多种几何约束工具（距离约束、角度约束、垂直约束、平行约束等）
- **图层管理**: 支持图层的管理和显示控制
- **历史记录**: 支持撤销/重做操作
- **实时求解**: 约束条件实时求解更新图形

## 项目结构

```
├── index.html                    # 应用入口页面
├── bezier-curve-learning.html    # Bezier 曲线学习工具
├── bezier-surface-threejs.html   # Bezier 曲面学习工具（基于 Three.js）
├── dist/                         # 构建后的应用文件
│   ├── index.html
│   └── assets/
│       ├── index-*.css          # 样式文件
│       └── index-*.js           # JavaScript bundle
├── cmd.txt                       # 配置文件
└── launch.json                   # VS Code 调试配置
```

## 功能特性

### 约束工具
- 距离约束
- 角度约束
- 垂直约束
- 平行约束
- 相切约束
- 同心约束

### 操作功能
- 实体选择与编辑
- 图层显示/隐藏
- 撤销/重做
- 实时约束求解

## 快速开始

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 运行应用

1. 开发模式：
   ```bash
   npm run dev
   ```
   然后在浏览器中打开显示的地址（通常是 http://localhost:5173）

2. 生产模式：
   ```bash
   npm run build
   ```
   然后使用任意 HTTP 服务器运行 `dist` 目录

## 学习工具

项目中包含了两个独立的学习演示页面：

- **bezier-curve-learning.html**: 交互式 Bezier 曲线学习工具
- **bezier-surface-threejs.html**: 基于 Three.js 的 Bezier 曲面可视化工具

可以直接在浏览器中打开这些 HTML 文件进行学习。

## 技术栈

- **前端框架**: Vue 3
- **构建工具**: Vite
- **3D 渲染**: Three.js（用于曲面演示）
- **语言**: TypeScript

## 许可证

MIT License