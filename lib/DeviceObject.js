/* ------------------------------------------------------------------
* DeviceObject.js
* デバイスオブジェクトのモジュール
* ---------------------------------------------------------------- */
'use strict';
const mDeviceState = require('./DeviceState.js');

class DeviceObject {
  /* ------------------------------------------------------------------
  * Constructor
  * ---------------------------------------------------------------- */
  constructor(eoj, desc, user_init_values, conf, ip_address_utils, standard_version, parser, eoj_settings) {
    this._eoj = eoj;
    this._desc = JSON.parse(JSON.stringify(desc));
    this._user_init_values = user_init_values || {};
    this._conf = conf;
    this._ip_address_utils = ip_address_utils;
    this._standard_version = standard_version;
    this._parser = parser;
    this._eoj_settings = eoj_settings || {};

    this._states = null; // DeviceState オブジェクトのインスタンス

    // デバイスオブジェクトから EL パケットを送信する場合は、
    // このイベントハンドラを呼び出す
    this.onsend = (address, packet) => { };

    // EPC の値が更新されたときに呼び出すイベントハンドラ
    this.onepcupdated = (eoj, props) => { };
  }

  updateConf(conf) {
    this._conf = JSON.parse(JSON.stringify(conf));
  }

  /* ------------------------------------------------------------------
  * init()
  * 初期化する
  * ---------------------------------------------------------------- */
  init() {
    // DeviceState オブジェクトを生成
    this._states = new mDeviceState(
      this._eoj,
      this._desc,
      this._user_init_values,
      this._conf,
      this._standard_version,
      this._parser,
      this._eoj_settings
    );
    this._states.init();

    // EDT データに変化があった時に呼び出されるイベントハンドラをセット
    this._states.onchange = (changed) => {
      // EPC 更新イベント発火
      this.onepcupdated(this._eoj, changed);
      // 状態変化 INF をマルチキャスト送信
      this._sendStatusChangeInf(null, changed);
    };
  }

  /* ------------------------------------------------------------------
  * getStandardVersion()
  * リリースバージョンを返す
  *
  * 引数:
  * - なし
  *
  * 戻値:
  * - リリースバージョン (例: "J")
  * ---------------------------------------------------------------- */
  getStandardVersion() {
    return this._standard_version;
  }

  /* ------------------------------------------------------------------
  * getAccessRule(epc)
  * EPC に対するアクセスルールを返す
  *
  * 引数:
  * - epc    | String | required | EPC (例: "80")
  *
  * 戻値:
  * {
  *   "get": true,
  *   "set": true,
  *   "inf": false
  * }
  * ---------------------------------------------------------------- */
  getAccessRule(epc) {
    return this._states.getAccessRule(epc);
  }

  /* ------------------------------------------------------------------
  * getEpcValues(props, is_admin)
  * EPC の値 (EDT) を読みだす (ダッシュボード向け)
  *
  * 引数:
  * - props    | Array   | required |
  *     - 例: [{"epc": "8A", "edt":"any"}, ...]
  *     - epc の値しか見ないので edt の any の部分は何が入っていても構わない
  * - is_admin | Boolean | optional |
  *     - true なら、Device Description のアクセスルールをチェックせずに
  *       強制的に実行する。主にダッシュボード向けに使うモード。
  *     - false なら Device Description のアクセスルールに基づいた動作を
  *       行う。主に EL パケット受信時の処理のために使うモード。
  *     - デフォルトは false。
  *
  * 戻値:
  * - Promise オブジェクト
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  * {
  *    result  : 読み出しに失敗した EDT の数 (つまりすべて成功すれば 0),
  *    message : エラーメッセージ、エラーがなければ null, 複数の失敗があれば最後のエラーメッセージがセット,
  *    vals    : 読み出しに成功した EDT にはその値 が、失敗した EDT には null がセット
  *  }
  *
  * reject() は本メソッドに渡されたパラメータに不備があった場合のみ呼び出される。
  * ---------------------------------------------------------------- */
  getEpcValues(props, is_admin) {
    return this._states.getEpcValues(props, is_admin);
  }

  /* ------------------------------------------------------------------
  * setEpcValues(props, is_admin, set_delay_msec)
  * EPC の値 (EDT) を書き込む
  *
  * 引数:
  * - props    | Array   | required |
  *     - 例: [{"epc": "8A", "edt":"any"}, ...]
  * - is_admin | Boolean | optional |
  *     - true なら、Device Description のアクセスルールをチェックせずに
  *       強制的に実行する。主にダッシュボード向けに使うモード。
  *     - false なら Device Description のアクセスルールに基づいた動作を
  *       行う。主に EL パケット受信時の処理のために使うモード。
  *     - デフォルトは false。
  * - set_delay_msec | Number | optional |
  *     - 実際に EPC データを書き込む際の遅延時間 (ミリ秒)。
  *     - is_admin が false の場合のみ有効。
  *     - 実際に EPC データを書き込む前に resolve() を呼び出す。
  *     - EL パケット受信時の処理のために使うオプション。
  *
  * 戻値:
  * - Promise オブジェクト
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  * {
  *    result  : 保存に失敗した EDT の数 (つまりすべて成功すれば 0),
  *    message : エラーメッセージ、エラーがなければ null, 複数の失敗があれば最後のエラーメッセージがセット,
  *    vals    : 保存に成功した EDT は null が、失敗した EDT は引数の vals と同じ (SNA を想定),
  *    changed : 変更があった ECP と EDT のハッシュオブジェクト (状態変化INFの情報源として使われる)
  *  }
  *
  * reject() は本メソッドに渡されたパラメータに不備があった場合のみ呼び出される。
  * ---------------------------------------------------------------- */
  setEpcValues(props, is_admin, set_delay_msec) {
    return new Promise((resolve, reject) => {
      this._states.setEpcValues(props, is_admin, set_delay_msec).then((res) => {
        resolve(res);
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * receive(address, parsed)
  * EL パケット受信時の処理
  * - address: 発信元IPアドレス
  * - parsed : EL パケット解析済みデータ
  * ---------------------------------------------------------------- */
  receive(address, parsed) {
    // 送信専用ノードプロファイルなら受信パケットは無視
    if (this._eoj === '0EF002') {
      return;
    }

    let d = parsed['data']['data'];

    let packet = {
      tid: d['tid']['value'],
      seoj: d['seoj']['hex'],
      deoj: d['deoj']['hex'],
      esv: d['esv']['hex'],
      properties: []
    };

    let props = d['properties'];
    for (let i = 0, len = props.length; i < len; i++) {
      let prop = props[i];
      packet['properties'].push({
        epc: prop['epc']['hex'],
        edt: prop['edt']['hex']
      });
    }

    if (d['properties2']) {
      packet['properties2'] = [];
      let props2 = d['properties2'];
      for (let i = 0, len = props2.length; i < len; i++) {
        let prop2 = props2[i];
        packet['properties2'].push({
          epc: prop2['epc']['hex'],
          edt: prop2['edt']['hex']
        });
      }
    }

    let esv = packet['esv'];
    if (esv === '60') { // SetI 書き込み要求：応答不要
      this._receiveReqSetI(address, packet);
    } else if (esv === '61') { // SetC 書き込み要求：応答要
      this._receiveReqSetC(address, packet);
    } else if (esv === '62') { // Get 読み出し要求
      this._receiveReqGet(address, packet);
    } else if (esv === '63') { // INF_REQ 通知要求
      this._receiveReqInfReq(address, packet);
    } else if (esv === '6E') { // SetGet 書き込み・読み出し要求
      this._receiveReqSetGet(address, packet);
    } else if (esv === '74') { // INFC 通知：応答要
      this._receiveReqInfC(address, packet);
    }
    // ESV が上記以外は無視
  }

  // SetI 書き込み要求：応答不要
  _receiveReqSetI(address, packet) {
    let epc_list = [];
    packet['properties'].forEach((o) => {
      epc_list.push(o['epc']);
    });
    let set_delay_msec = this._getSetDelayMsec(epc_list);

    this.setEpcValues(packet['properties'], false, set_delay_msec).then((res) => {
      // 失敗があった時だけ SNA を返す
      if (res['result'] > 0) {
        let res_packet = this._createSnaPacket(packet, res['vals']);
        setTimeout(() => {
          this.onsend(address, res_packet);
        }, this._getResponseWaitMsec(packet, Object.keys(res['vals'])));
      }
    }).catch((error) => {
      console.error(error);
    });
  }

  // SetC 書き込み要求：応答要
  _receiveReqSetC(address, packet) {
    let epc_list = [];
    packet['properties'].forEach((o) => {
      epc_list.push(o['epc']);
    });
    let set_delay_msec = this._getSetDelayMsec(epc_list);
    this.setEpcValues(packet['properties'], false, set_delay_msec).then((res) => {
      /*
      * res = {
      *   result  : 保存に失敗した EDT の数 (つまりすべて成功すれば 0),
      *   message : エラーメッセージ、エラーがなければ null, 複数の失敗があれば最後のエラーメッセージがセット,
      *   vals    : 保存に成功した EDT は null が、失敗した EDT は引数の vals と同じ (SNA を想定),
      *   changed : 変更があった ECP と EDT のハッシュオブジェクト (状態変化INFの情報源として使われる)
      * }
      */
      let res_packet = null;
      if (res['result'] === 0) {
        res_packet = this._createResPacket(packet, res['vals']);
      } else {
        res_packet = this._createSnaPacket(packet, res['vals']);
      }
      setTimeout(() => {
        this.onsend(address, res_packet);
      }, this._getResponseWaitMsec(packet, Object.keys(res['vals'])));
    }).catch((error) => {
      console.error(error);
    });
  }

  // 状態変化 INF 送信 (マルチキャスト送信)
  _sendStatusChangeInf(packet, changed) {
    // 引数 packet が存在する場合は INF_REQ に対する応答
    // 存在しなければ、純粋な状態変化を意味する

    if (!changed || typeof (changed) !== 'object' || Object.keys(changed).length === 0) {
      return;
    }

    let props = {};
    Object.keys(changed).forEach((epc) => {
      let epc_data = this._desc['elProperties'][epc];
      if (!epc_data || !epc_data['accessRule']) {
        return;
      }
      // アクセスルールをチェック
      // ただし、INF_REQ の場合は get が true なら OK
      let rule = this.getAccessRule(epc);
      if (packet) {
        if (!rule['get']) {
          return;
        }
      } else {
        if (!rule['inf']) {
          return;
        }
      }
      props[epc] = changed[epc];
    });

    if (Object.keys(props).length === 0) {
      return;
    }

    let inf_packet = {
      seoj: this._eoj,
      deoj: packet ? packet['seoj'] : '0EF001',
      esv: '73',
      properties: []
    };

    if (packet) {
      inf_packet['tid'] = packet['tid'];
      // INF_REQ の場合は、
      // 1081 6648 05FF01 013001 63(INF_REQ) 02(OPC) 80 00 80 00
      // のように、同じ EPC を 2 回以上繰り返す場合があるので、
      // リクエストの順番通りに値をセットする
      //
      // ただし、EPC=0x00 のような EDT を特定できないものが
      // リクエストされた場合は、ESV=0x53(INF_SNA) を返す
      packet['properties'].forEach((p) => {
        let epc = p['epc'];
        let edt = props[epc];
        inf_packet['properties'].push({
          epc: epc,
          edt: edt
        });
        if (!edt) {
          inf_packet['esv'] = '53';
        }
      });
    } else {
      Object.keys(props).forEach((epc) => {
        let edt = props[epc];
        inf_packet['properties'].push({
          epc: epc,
          edt: edt
        });
      });
    }

    this.onsend(null, inf_packet);
  }

  // Get 読み出し要求
  _receiveReqGet(address, packet) {
    this._states.getEpcValues(packet['properties']).then((res) => {
      /*
      * res = {
      *   result  : 読み出しに失敗した EDT の数 (つまりすべて成功すれば 0),
      *   message : エラーメッセージ、エラーがなければ null, 複数の失敗があれば最後のエラーメッセージがセット,
      *   vals    : 読み出しに成功した EDT にはその値 が、失敗した EDT には null がセット (SNA を想定)
      * }
      */
      let res_packet = null;
      if (res['result'] === 0) {
        res_packet = this._createResPacket(packet, res['vals']);
      } else {
        res_packet = this._createSnaPacket(packet, res['vals']);
      }
      setTimeout(() => {
        this.onsend(address, res_packet);
      }, this._getResponseWaitMsec(packet, Object.keys(res['vals'])));
    }).catch((error) => {
      console.error(error);
    });
  }

  _getSetDelayMsec(epc_list) {
    if (!epc_list || !Array.isArray(epc_list)) {
      epc_list = [];
    }
    let msec = 0;
    epc_list.forEach((epc_hex) => {
      let s = this._eoj_settings[epc_hex];
      if (s && s['settingTime'] && typeof (s['settingTime']) === 'number') {
        if (s['settingTime'] > msec) {
          msec = s['settingTime'];
        }
      }
    });
    if (msec > 0) {
      return msec;
    } else {
      return this._conf['epc_data_setting_time_msec'];
    }
  }

  _getResponseWaitMsec(req_packet, epc_list) {
    if (!epc_list || !Array.isArray(epc_list)) {
      epc_list = [];
    }

    let getWaitMsec = (k) => {
      let msec = this._conf[k + '_res_wait_msec'];
      epc_list.forEach((epc_hex) => {
        let s = this._eoj_settings[epc_hex];
        if (s && s['responseTime'] && typeof (s['responseTime']) === 'object' && s['responseTime'][k]) {
          if (s['responseTime'][k] > msec) {
            msec = s['responseTime'][k];
          }
        }
      });
      return msec;
    };

    if (this._isMulticastRequest(req_packet)) {
      let min = this._conf['multicast_response_wait_min_msec'];
      let max = this._conf['multicast_response_wait_max_msec'];
      if (min === max) {
        return max;
      }
      if (min > max) {
        let tmp = min;
        min = max;
        max = tmp;
      }
      let r = max - min;
      let wait = min + Math.floor(Math.random() * (r + 1));
      return wait;
    } else {
      let esv = req_packet['esv'];
      let wait = 0;
      if (esv === '60') { // SetI 書き込み要求：応答不要 (SNA を返す場合のみ)
        //return this._conf['set_res_wait_msec'];
        wait = getWaitMsec('set');
      } else if (esv === '61') { // SetC 書き込み要求：応答要
        //return this._conf['set_res_wait_msec'];
        wait = getWaitMsec('set');
      } else if (esv === '62') { // Get 読み出し要求
        //return this._conf['get_res_wait_msec'];
        wait = getWaitMsec('get');
      } else if (esv === '63') { // INF_REQ 通知要求
        //return this._conf['inf_res_wait_msec'];
        wait = getWaitMsec('inf');
      } else if (esv === '6E') { // SetGet 書き込み・読み出し要求
        //return this._conf['set_res_wait_msec'];
        wait = getWaitMsec('set');
      } else if (esv === '74') { // INFC 通知：応答要	
        //return this._conf['inf_res_wait_msec'];
        wait = getWaitMsec('inf');
      }
      return wait;
    }
  }

  _isMulticastRequest(req_packet) {
    let p = req_packet;
    if (/00$/.test(p['deoj']) && /^(61|62|63|6E)$/.test(p['esv'])) {
      return true;
    } else {
      return false;
    }
  }

  // INF_REQ 通知要求
  _receiveReqInfReq(address, packet) {
    this._states.getEpcValues(packet['properties']).then((res) => {
      /*
      * res = {
      *   result  : 読み出しに失敗した EDT の数 (つまりすべて成功すれば 0),
      *   message : エラーメッセージ、エラーがなければ null, 複数の失敗があれば最後のエラーメッセージがセット,
      *   vals    : 読み出しに成功した EDT にはその値 が、失敗した EDT には null がセット (SNA を想定)
      * }
      */
      setTimeout(() => {
        if (res['result'] === 0) {
          // 状態変化 INF をマルチキャスト送信
          this._sendStatusChangeInf(packet, res['vals']);
        } else {
          // INF_SNA をユニキャスト送信
          let res_packet = this._createSnaPacket(packet, res['vals']);
          this.onsend(address, res_packet);
        }
      }, this._getResponseWaitMsec(packet, Object.keys(res['vals'])));
    }).catch((error) => {
      // パケットが壊れているので何もしない
      console.error(error);
    });
  }

  // SetGet 書き込み・読み出し要求
  _receiveReqSetGet(address, packet) {
    // PacketComposer に SetGet に関連するパケット生成の仕組みがないので、
    // SetGet は扱わない。ここではすべて SetGetSNA を返す
    let res_packet = this._createSnaPacket(packet, []);
    this.onsend(address, res_packet);


    /*
    let epc_list = [];
    packet['properties'].forEach((o) => {
      epc_list.push(o['epc']);
    });
    let set_delay_msec = this._getSetDelayMsec(epc_list);
  
    let props = packet['properties'];
    let props2 = packet['properties2'];
    if (!props2) {
      props2 = [];
    }
  
    this.setEpcValues(props, false, set_delay_msec).then((res) => {
      return this._states.getEpcValues(props2);
    }).then((res) => {
      let res_packet = null;
  
      if (res['result'] === 0) {
        res_packet = this._createResPacket(packet, res['vals']);
      } else {
        res_packet = this._createSnaPacket(packet, []);
      }
  
      setTimeout(() => {
        this.onsend(address, res_packet);
      }, set_delay_msec);
    }).catch((error) => {
      let res_packet = this._createSnaPacket(packet, []);
      this.onsend(address, res_packet);
    });
    */
  }

  // 0x74 INFC 通知：応答要
  _receiveReqInfC(address, packet) {
    let props = {};
    let epc_list = [];
    packet['properties'].forEach((p) => {
      props[p['epc']] = null;
      epc_list.push(p['epc']);
    });
    let res_packet = this._createResPacket(packet, props);
    setTimeout(() => {
      this.onsend(address, res_packet);
    }, this._getResponseWaitMsec(packet, epc_list));
  }

  _createSnaPacket(packet, props) {
    /* ----------------------------------------------------------------
    * packet: リクエストのパケット
    *   - tid        | integer | optional | 指定がなけれは自動採番
    *   - seoj       | string  | required | 16進数文字列 (例: "013001")
    *   - deoj       | string  | required | 16進数文字列 (例: "05FF01")
    *   - esv        | string  | required | 16進数文字列
    *   - properties | array   | required | object のリスト
    *     - epc      | string  | required | EPCの16進数文字列 (例: "80")
    *     - edt      | string  | optional | EDTの16進数文字列
    * ------------------------------------------------------------- */

    // リクエストの ESV に対応する SNA の ESV に変換
    let esv = packet['esv'];
    let esv1 = esv.substr(0, 1);
    let esv2 = esv.substr(1, 1);
    if (esv1 !== '6' || !/^(0|1|2|3|E)$/.test(esv2)) {
      return null;
    }
    let sna_esv = '5' + esv2;

    let sna_packet = {
      //tid: parseInt(packet['tid'], 16),
      tid: packet['tid'],
      seoj: this._eoj,
      deoj: packet['seoj'],
      esv: sna_esv,
      properties: []
    };

    if (esv !== '6E') {
      let prop_list = packet['properties'];
      for (let i = 0, len = prop_list.length; i < len; i++) {
        let prop = prop_list[i];
        let epc = prop['epc'];
        let edt = prop['edt'];
        if (props && (epc in props)) {
          edt = props[epc];
        }
        sna_packet['properties'].push({
          epc: epc,
          edt: edt
        });
      }
    }
    return sna_packet;
  }


  _createResPacket(packet, props) {
    /* ----------------------------------------------------------------
    * packet:
    *   - tid        | integer | optional | 指定がなけれは自動採番
    *   - seoj       | string  | required | 16進数文字列 (例: "013001")
    *   - deoj       | string  | required | 16進数文字列 (例: "05FF01")
    *   - esv        | string  | required | ESV キーワード (例: "GET_RES")
    *   - properties | array   | required | object のリスト
    *     - epc      | string  | required | EPCの16進数文字列 (例: "80")
    *     - edt      | string  | optional | EDTの16進数文字列
    * ------------------------------------------------------------- */

    // リクエストの ESV に対応する SNA の ESV に変換
    let esv = packet['esv'];
    let esv1 = esv.substr(0, 1);
    let esv2 = esv.substr(1, 1);
    if (!/^(61|62|63|6E|74)$/.test(esv)) {
      return null;
    }

    if (esv1 === '6') {
      esv = '7' + esv2;
    } else {
      esv = '7A';
    }

    let res_packet = {
      tid: packet['tid'],
      seoj: this._eoj,
      deoj: packet['seoj'],
      esv: esv,
      properties: []
    };

    let prop_list = packet['properties'];
    for (let i = 0, len = prop_list.length; i < len; i++) {
      let prop = prop_list[i];
      let epc = prop['epc'];
      let edt = prop['edt'];
      if (props && (epc in props)) {
        edt = props[epc];
      }
      res_packet['properties'].push({
        epc: epc,
        edt: edt
      });
    }

    return res_packet;
  }
}

module.exports = DeviceObject;
