---
title: "AGX Orin 64GB 快速开始：部署前检查"
product: "jetson-agx-orin-64gb"
order: 2
summary: "区分量产模组与开发套件，准备载板、软件版本和验证记录。"
sourceReferences: ["orin-spec","faq","jetpack","agx-guide"]
---

## 适用对象与安全提示

本页面向准备部署 Jetson AGX Orin 64GB 量产模组的客户，提供检查顺序。模组与开发套件是不同交付形态；必须先确认模组安装在哪一块载板上。

> 请按设备供应方的装配与供电说明操作。改变系统镜像前备份需要保留的数据；载板资料、供电或散热条件不明确时，先完成确认再上电或刷写。

## 先确认硬件

1. 核对模组标签、订单和实物型号，参照[Jetson Orin 官方产品规格](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/)确认所选产品。
2. 记录载板型号、修订号、存储介质与外设清单，向整机或载板供应方索取对应交付说明。
3. 结合[Jetson 官方 FAQ](https://developer.nvidia.com/embedded/faq)核对模组和载板适配信息，确认散热与供电准备条件。

## 按交付形态准备软件

1. 若使用原装 NVIDIA AGX Orin 开发套件，打开[开发套件快速开始](https://docs.nvidia.com/jetson/agx-orin-devkit/user-guide/latest/quick_start.html)，先核对指南适用硬件，再遵循其步骤。
2. 若使用第三方或自研载板，先取得该载板适配的镜像、配置与操作说明。开发套件步骤不能自动证明该载板兼容。
3. 在[JetPack SDK 下载与支持说明](https://developer.nvidia.com/embedded/jetpack/downloads)核对目标分支、支持设备与安装入口；同时确认该分支与交付软件一致。
4. 按所选流程完成部署后，记录启动结果、外设识别情况和应用验证结果，作为后续支持依据。

## 适用版本

本文不固定 JetPack 或 Host OS 版本。使用当前下载入口时，核对当前分支的支持列表；使用历史镜像时，核对同一版本的归档说明。两者均须与实际载板支持范围一致。

## 下一步

准备变更系统时继续阅读[系统刷写与 JetPack 核对](/docs/jetson-agx-orin-64gb/flashing-and-jetpack/)。尚在选型阶段可返回[AGX Orin 64GB 产品页](/products/jetson-agx-orin-64gb/)。
