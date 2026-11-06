# 视觉实训设备与产品图片更新设计

## 目标

一次性完成三类更新：新增“视觉实训开发套件”产品；删除 MI‑19x2 主图中的“隐溪科技 HCKdigi”字样；使用 `D:/jetson/照片素材/模组/` 中的四张同名模组照片替换对应产品展示图。完成后重新构建并重启本地站点。

## 新产品

- 正式名称：视觉实训开发套件
- 产品类型：视觉实训设备
- 所属系列：正阳恒卓整机与载板
- 页面 slug：`vision-training-kit`
- 主图：`D:/jetson/北中医/第二代.jpg`
- 定位：面向中医药图像采集、识别、模型部署及计算机视觉教学实训的一体化设备。
- 核心指标：157 TOPS（INT8 稀疏，Super 模式）、16GB 128-bit LPDDR5、2000 万像素工业相机、19 英寸及以上电容触控屏。
- 数据依据：`D:/jetson/北中医/视觉实训开发套件参数.xlsx`；不采用技术方案内冲突的 275 TOPS / AGX Orin 64GB 描述。
- 详情内容：产品介绍、亮点、应用场景、边缘计算、图像采集、结构与显示、接口和采购咨询。
- 发布一份站内 HTML 产品手册，不公开采购数量、客户名称、报价或投标信息。

## 图片更新

### MI‑19x2

编辑目标为现有 `assets/products/mi-19x2/hero.png`。只删除机身前侧“隐溪科技 HCKdigi”，以相邻黑色金属表面的纹理、透视和光影自然补全。不得添加正阳恒卓标识，不得改变产品、接口、散热片、风扇、背景、构图或尺寸。

### NVIDIA 模组

按文件名一一映射，不复用到其他容量或开发套件：

- `NVIDIA Jetson AGX Orin 64GB Module.png` → `jetson-agx-orin-64gb`
- `NVIDIA Jetson Orin NX 16GB Module.png` → `jetson-orin-nx-16gb`
- `NVIDIA Jetson Orin Nano 8GB Module.png` → `jetson-orin-nano-8gb`
- `NVIDIA Jetson T5000 Module.png` → `jetson-t5000`

NVIDIA 产品继续保留官方 `heroImage` 作为来源证据；新增可选的本地 `displayImage` 仅负责页面展示，不能降低官方来源与性能字段校验。

## 验收

- 产品总数由 18 增至 19，第五系列由 6 款增至 7 款。
- 新产品详情、站内手册和带产品上下文的询价入口可用。
- MI‑19x2 主图不再出现“隐溪科技”或“HCKdigi”，且没有新增品牌标识。
- 四个指定 NVIDIA 型号展示本地提供的对应图片，其他产品图片不变。
- 全站构建、测试和静态检查通过；本地预览重启后 `/products/`、MI‑19x2 与新产品详情均返回 200。

