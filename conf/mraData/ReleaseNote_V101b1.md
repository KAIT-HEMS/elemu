# MRA Release note (V1.0.1b1)

2022.01.07

- Data version: 1.0.1b1
- Data format version: 1.0.0
- Appendix Release version: M

## Revision history

Data version | Date | Description
:-----|:-----------|:---
1.0.0 | 2021.11.17 | Official release (V1.0.0b9 を V1.0.0としてリリース)
1.0.1 | 2021.12.01 | 内部 release。V1.1.0 の作業のベース。</br>MRA V1.0.0 から作成した DD の validation で見つかった不具合対応</br>その他マイナーな修正

## MRA V1.0.1b1 変更内容

File | EPC | 変更内容
:-----|:-----------|:---
0x027A_mcrule.json | 0xE7 | noteの記述の位置を修正
0x027A_mcrule.json | 0xE8 | noteの記述の位置を修正
0x027B_mcrule.json | 0xE7 | noteの記述の位置を修正
0x027B_mcrule.json | 0xE8 | noteの記述の位置を修正
0x0280_mcrule.json | 0xE0 | 記述追加 (\*1)
0x0280_mcrule.json | 0xE3 | 記述追加 (\*1)
0x03B9_mcrule.json | 0xE7 | 正しい DD が生成されるように、oneOf の記述を修正
0x0290.json        | 0xBB | shortName を lightColorForMainLighting に修正する
0x027A.json        | 0xE7 | note を remark に修正
0x027A.json        | 0xE8 | note を remark に修正
0x0288.json        | 0xE5 | definitions/state_DefaultValue_FF を参照するように修正（内容の変更は無し）
0x0602.json        | 0xB2 | bitmaps 内の name を Device Descriptions に合わせるように修正 (\*2)
definitions.json   |      | number_-999999999--1Wh の "format" の value を修正 (unit32->int32) (\*3)

(\*1)

```
"note" : {
  "ja" : "EPC=0xE2の値を乗算済みの値",
  "en" : "The value is multipled by the value of EPC=0xE2."
}
```

(\*2)

修正前 | 修正後
:-----|:-------
ansiX34 | ansiX34Equipped
shiftJis | shiftJisEquipped
jis | jisEquipped
japaneseEuc | japaneseEucEquipped
ucs4 | ucs4Equipped
ucs2 | ucs2Equipped
latin1 | latin1Equipped
utf8 | utf8Equipped

(\*3)

修正前

```json
    "number_-999999999--1Wh": {
      "type": "number",
      "format": "uint32",
      "minimum": -999999999,
      "maximum": -1,
      "unit": "Wh"
    },
```

修正後

```json
    "number_-999999999--1Wh": {
      "type": "number",
      "format": "int32",
      "minimum": -999999999,
      "maximum": -1,
      "unit": "Wh"
    },
```
