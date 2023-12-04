# ECHONET Lite 機器エミュレータ

神奈川工科大学スマートハウス研究センター 2022.10.04

## Revision history

Date | Version  | Description
:-----------|:-----|:-----
2019.03.28 | V20190328 | First official release
2019.11.28 | V20191103 | Support EL device description V3.1
2019.12.07 | V20191207 | Fixed a following bug<br>Storage Battery(0x027D) EPC=0xAA, GET value is wrong after SET 0x00000000.
2019.12.22 | V20191222 | Fixed a following bug<br>Controller(0x05FF) does not display detailed information of discovered devices, when a device return a manufacture code that is not registered in the table.
2020.06.09 | V20191222 | Update Device Description to 3.1.6r3_sub to support Release M
2022.01.05 | V20220105 | Change to MRA from Device Description(\*1)</br>Add a function to disable internal clock for a time-escalated emulation(\*2)
2022.10.03 | V1.0.0 | - Updated property value of EPC:0x82 from "A" (0x41) to "a" (0x61) in case of Release A</br>- Removed "O" from options of Release Version at Register a new EOJ screen</br>- Added a method to launch this program by "npm start"

(\*1) Device Description data is created and maintained by KAIT. This data was transfered to ECHONET Consortium in 2021. After some updates and modifications of the data structure and data itself, ECHONET Consortium released the data as [Machine Readable Appendix (MRA)](https://echonet.jp/spec_g/#standard-08) on Dec. 1st 2021.

(\*2) Please refer to an operation manual for details

## Abstract

- ECHONET Lite機器エミュレータは30種類以上の機器エミュレーターです。全てのプロパティをサポートしています。
- ECHONET Lite認証試験及びECHONET Lite AIF認証試験に対応できるレベルの実装です。

## Required environment / 動作環境

- Windows, MacOS, Linuxなどで動作します。インストールおよび起動に関してはユーザーマニュアルを参照ください。

## コントローラとしての機能

- ECHONET Lite messageを作成、送信する機能
- 受信したECHONET Lite messageをパースする機能
- 送受信ログ機能

コントローラとして動作させる場合は、ノードプロファイル以外の機器オブジェクトを全て削除してから、コントローラを追加してください。

## プロパティの機能の実装について

以下のプロパティのみ内部動作が実装されています。

### 住宅用太陽光発電: PV Power Generation: 0x0279

|EPC   |Property name|Logic
|:-----|:------------|:-----
| 0xE2 | 積算発電電力量リセット設定 |Set(0xE2)で0xE1の値を0にする
| 0xE4 | 積算売電電力量リセット設定 |Set(0xE4)で0xE3の値を0にする

### 燃料電池: Fuel Cell: 0x027C

|EPC   |Property name|Logic
|:-----|:------------|:-----
| 0xC6 | 積算発電電力量リセット設定 |Set(0xC6)で0xC5の値を0にする
| 0xC9 | 積算ガス消費量リセット設定 |Set(0xC9)で0xC8の値を0にする
| 0xCE | 宅内積算消費電力量リセット設定 |Set(0xCE)で0xCDの値を0にする

### 蓄電池: Storage Battery: 0x027D

|EPC   |Property name|Logic
|:-----|:------------|:-----
| 0xD7| 積算放電電力量リセット設定 |Set(0xD7)で0xD6の値を0にする
| 0xD9| 積算充電電力量リセット設定 |Set(0xD9)で0xD8の値を0にする

### 電気自動車充放電器: EV Charger and Discharger: 0x027E

|EPC   |Property name|Logic
|:-----|:------------|:-----
| 0xD7 | 積算放電電力量リセット設定 |Set(0xD7)で0xD6の値を0にする
| 0xD9 | 積算充電電力量リセット設定 |Set(0xD9)で0xD8の値を0にする

### 電気自動車充電器: EV Charger: 0x02A1

|EPC   |Property name|Logic
|:-----|:------------|:-----
| 0xD9 | 積算充電電力量リセット設定 |Set(0xD9)で0xD8の値を0にする

### 分電盤メータリング: Power Distribution Board: 0x0287

|EPC   |Property name|Logic
|:-----|:------------|:-----
|0xB3  |積算電力量計測値リスト（片方向）|0xB2で指定した値
|0xB5  |瞬時電流計測値リスト（片方向）|0xB4で指定した値
|0xB7  |瞬時電力計測値リスト（片方向）|0xB6で指定した値
|0xBA  |積算電力量計測値リスト（双方向）|0xB9で指定した値
|0xBC  |瞬時電流計測値リスト（双方向）|0xBBで指定した値
|0xBE  |瞬時電力計測値リスト（双方向）|0xBDで指定した値
|0xC3  |積算電力量計測値履歴（正方向）|0xC5で指定した履歴値
|0xC4  |積算電力量計測値履歴（逆方向）|0xC5で指定した履歴値

### 低圧スマート電力量メータ: Low Voltage Smart Electric Energy Meter: 0x0288

|EPC   |Property name|Logic
|:-----|:------------|:-----
|0xE2  |積算電力量計測値履歴1（正方向計測値）|0xE5で指定した履歴値
|0xE4  |積算電力量計測値履歴1（逆方向計測値）|0xE5で指定した履歴値
|0xEC  |積算電力量計測値履歴2（正方向、逆方向計測値）|0xEDで指定した履歴値

### 高圧スマート電力量メータ: High Voltage Smart Electric Energy Meter: 0x028A

|EPC   |Property name|Logic
|:-----|:------------|:-----
|0xC6  |需要電力量計測値履歴|0xE1で指定した履歴値
|0xCE  |力測積算無効電力量（遅れ）計測値履歴|0xE1で指定した履歴値
|0xE7  |積算有効電力量計測値履歴|0xE1で指定した履歴値

## FAQ

Q:コンソール画面に以下のエラーが表示されます。  
A:3610ポートを利用するアプリケーション（SSNG for Node.jsなど）は、あらかじめ終了してください。  

```
[SY] Starting the device...                                            [  NG  ] 
{ Error: bind EADDRINUSE 0.0.0.0:3610
    at Object._errnoException (util.js:992:11)
    at _exceptionWithHostPort (util.js:1014:20)
    at _handle.lookup (dgram.js:266:18)
    at _combinedTickCallback (internal/process/next_tick.js:141:11)
    at process._tickCallback (internal/process/next_tick.js:180:9)
  code: 'EADDRINUSE',
  errno: 'EADDRINUSE',
  syscall: 'bind',
  address: '0.0.0.0',
  port: 3610 }
```

Q:WindowsでUDPの送受信が正常にできません。  
Q:Windowsでマルチキャストの送受信が正常にできません。  
A:ファイアウォール（Winodws defender)の設定で、Node.jsの通信が許可されていることを確認してください。  

Q:新規追加画面の機器リストに表示されない種類の機器を利用したい。  
A:MRA データを作成し、機器エミュレータに追加してください。

## License

MIT license

## Contact

contact@sh-center.org
