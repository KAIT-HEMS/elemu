# MRA Release note (V1.1.0b1)

## Revision history

Data version | Date | Description
:---|:---|:---
1.0.0 | 2021.11.17 | Official release
1.0.1 | 2021.12.01 | MRA v1.0.0 から作成した DD の validation で見つかった不具合対応
1.1.0b1 | 2021.1.19 | Release P 対応</br>機器追加: 0x0012 (湿度センサ), 0x001B (CO2センサ), 0x0281 (水流量メータ), 0x0282 (ガスメータ), 0x028D (スマート電力量サブメータ), 0x02A3 (照明システム)</br>Release P英語版におけるTypo等修正の対応</br>

## Summary

- Data version: 1.1.0b1
- Data format version: 1.0.0
- Appendix Release version: P

Release P 対応。新たに数機種を追加する。

## 追加機器

- 0x0007 人体検知センサ
- 0x0012 湿度センサ
- 0x0016 風呂沸き上がりセンサ
- 0x001B CO2センサ
- 0x0281 水流量メータ（MCRuleも追加）
- 0x0282 ガスメータ
- 0x028D スマート電力量サブメータ（MCRuleも追加）
- 0x02A3 照明システム

## Release M -> P における変更内容

## Release P英語版におけるTypo等修正の対応

## definitions の修正

- definitions に以下の項目を追加
  - number_1-999
  - number_1-999999
  - number_0-999999999m3
  - state_LightColor_40-44FD
  - state_NoData_FFFE

