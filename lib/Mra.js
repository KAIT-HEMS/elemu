/* ------------------------------------------------------------------
* Mra.js
* MRA (Machine Readable Appendix) のデータを扱うモジュール
* https://echonet.jp/spec_mra_rm/
*
* - MRA を扱いやすいように以下の通りに変換
*   - 0xFF を FF に変換 (0x の削除)
*   - superclass および definitions をマージする (ノードプロファイルを除く)
* - EOJ を指定したら、それに該当するデータを返す
*   - EPC のリストを与えると、それだけにフィルターする
* ---------------------------------------------------------------- */
'use strict';
const mPath = require('path');
const mFs = require('fs');

class Mra {
    /* ------------------------------------------------------------------
    * コンストラクタ
    * 
    * [引数]
    * - なし
    * ---------------------------------------------------------------- */
    constructor() {
        this._base_dir = mPath.resolve(__dirname, '../conf/mraData');

        // MRA のメタ情報
        this._meta = require(mPath.resolve(this._base_dir, 'metaData.json'));

        // 共通スキーマ定義
        const def = require(mPath.resolve(this._base_dir, 'definitions/definitions.json'));
        this._definitions = def.definitions;

        // スーパークラスの MRA 情報
        this._super = require(mPath.resolve(this._base_dir, 'superClass/0x0000.json'));

        // ---------------------------------------------------------
        // 各デバイスクラスごとの MRA 情報
        // - キーは EOJ 上位 2 バイトの 16 進数表記 (例: "0130")
        //
        // this._devices = {
        //   "0130": {...},
        //     ...
        //   }
        // }
        // ---------------------------------------------------------
        this._devices = {};

        // MRA データの規格 Version 情報
        this._standard_version = '';

        // ノードプロファイルの EOJ
        this._NODE_PROFILE_EOJ = '0EF0';
    }

    /* ------------------------------------------------------------------
    * init()
    * - 初期化
    * 
    * [引数]
    * - なし
    * 
    * [戻値]
    * - なし
    * ---------------------------------------------------------------- */
    init() {
        // 規格 Version 情報 
        let std_ver = this._meta.metaData.release;
        if (std_ver) {
            this._standard_version = std_ver.toUpperCase();
        } else {
            throw new Error('The release version was not found in the `mraData/metaData.json`.');
        }

        // Node プロファイルの MRA を読み取る
        let node_profile_data = this._getDeviceData(this._NODE_PROFILE_EOJ);
        this._devices[this._NODE_PROFILE_EOJ] = node_profile_data;

        // すべてのデバイスクラスの MRA を読み取る
        let fname_list = mFs.readdirSync(mPath.resolve(this._base_dir, 'devices'));
        for (let fname of fname_list) {
            if (/^0x[0-9A-F]{4}\.json$/.test(fname)) {
                let eoj = fname.substring(2, 6);
                let data = this._getDeviceData(eoj);
                this._devices[eoj] = data;
            }
        }
    }

    _getDeviceData(eoj) {
        if (this._devices[eoj]) {
            return JSON.parse(JSON.stringify(this._devices[eoj]));
        }

        // MRA の JSON ファイルを読み取る
        let fpath = '';
        let fname = '0x' + eoj + '.json';
        if (eoj === this._NODE_PROFILE_EOJ) {
            fpath = mPath.resolve(this._base_dir, 'nodeProfile', fname);
        } else {
            fpath = mPath.resolve(this._base_dir, 'devices', fname);
        }

        if (!mFs.existsSync(fpath)) {
            return null;
        }

        let json = mFs.readFileSync(fpath, 'utf8');
        let data = JSON.parse(json);
        data.eoj = data.eoj.replace(/^0x/, '');
        for (let prop of data.elProperties) {
            let epc = prop.epc.replace(/^0x/, '');
            prop.epc = epc;
        }

        // スーパークラスのプロパティ情報をマージ
        // (ノードプロファイルでない場合)
        if (eoj !== this._NODE_PROFILE_EOJ) {
            let epcs = {};
            for (let prop of data.elProperties) {
                epcs[prop.epc] = true;
            }

            for (let prop of this._super.elProperties) {
                let epc = prop.epc.replace(/^0x/, '');
                if (!epcs[epc]) {
                    let sprop = JSON.parse(JSON.stringify(prop));
                    sprop.epc = epc;
                    data.elProperties.push(sprop);
                }
            }
        }

        // definitions の情報をマージ
        for (let prop of data.elProperties) {
            if (prop.data) {
                this._replaceDefinition(prop.data);

                // -----------------------------------------------------------------
                // prop.data.enum のリスト内に "edt": "0x000a...0x0013" という記述があるので、
                // それを展開する
                // - eoj: '0263' (電動雨戸・シャッター), prop.epc: '89' (異常内容(復帰可能な異常))
                // - eoj: '0260' (電動ブラインド・日よけ), prop.epc: '89' (異常内容(復帰可能な異常))
                // -----------------------------------------------------------------
                if(prop.data.type === 'state' && prop.data.size && prop.data.enum) {
                    const size = prop.data.size;
                    const new_enum = [];
                    let hit = false;
                    for(const el of prop.data.enum) {
                        const m = el.edt.match(/^0x([0-9a-fA-F]{4})\.\.\.0x([0-9a-fA-F]{4})$/);
                        if(m) {
                            const sv = Buffer.from(m[1], 'hex').readUInt16BE(0);
                            const ev = Buffer.from(m[2], 'hex').readUInt16BE(0);
                            for(let v=sv; v<=ev; v++) {
                                const new_el = JSON.parse(JSON.stringify(el));
                                const buf = Buffer.alloc(2);
                                buf.writeUInt16BE(v);
                                new_el.edt = '0x' + buf.toString('hex').toUpperCase();
                                new_enum.push(new_el);
                            }
                            hit = true;
                        } else {
                            new_enum.push(el)
                        }
                    }

                    if(hit === true) {
                        prop.data.enum = JSON.parse(JSON.stringify(new_enum));
                    }
                }
            }
        }
        return JSON.parse(JSON.stringify(data));
    }

    _replaceDefinition(obj) {
        if (typeof (obj) !== 'object' || obj === null) {
            return;
        }
        if (Array.isArray(obj)) {
            for (let o of obj) {
                this._replaceDefinition(o);
            }
        } else {
            if (obj['$ref']) {
                let ref = obj['$ref'].replace(/^\#\/definitions\//, '');
                let def = this._definitions[ref];
                if (def) {
                    delete obj['$ref'];
                    Object.assign(obj, def);
                }
            } else {
                for (let o of Object.values(obj)) {
                    this._replaceDefinition(o);
                }
            }
        }
    }

    /* ------------------------------------------------------------------
    * getStandardVersion()
    * - 規格 Version 情報を返す
    * 
    * [引数]
    * - なし
    * 
    * [戻値]
    * - MRA のリリースバージョン (例: "M")
    * ---------------------------------------------------------------- */
    getStandardVersion() {
        return this._standard_version;
    }

    /* ------------------------------------------------------------------
    * getDeviceList()
    * - すべてのデバイス情報のリストを返す。EPC の情報は含まれない。
    * - ダッシュボードでプルダウン表示のために使う
    * - リストの先頭はノードプロファイル、以降は EOJ の昇順
    * 
    * [引数]
    * - なし
    * 
    * [戻値]
    * [
    *   {
    *     "eoj": "0EF0",
    *     "className": {
    *       "ja": "ノードプロファイル",
    *       "en": "Node profile"
    *     },
    *     "firstRelease": "A"
    *   },
    *   {
    *     "eoj": "000D",
    *     "className": {
    *       "ja": "照度センサ",
    *       "en": "Illuminance sensor"
    *     },
    *     "firstRelease": "A"
    *   },
    *   ...
    * ]
    * ---------------------------------------------------------------- */
    getDeviceList() {
        let eoj_list = [];
        for (let eoj of Object.keys(this._devices)) {
            if (eoj !== this._NODE_PROFILE_EOJ) {
                eoj_list.push(eoj);
            }
        }
        eoj_list.sort();
        eoj_list.unshift(this._NODE_PROFILE_EOJ);

        let data_list = [];
        for (let eoj of eoj_list) {
            let data = this._devices[eoj];
            data_list.push({
                eoj: data.eoj,
                className: {
                    ja: data.className.ja,
                    en: data.className.en
                },
                firstRelease: data.validRelease.from
            });
        }
        return data_list;
    }

    /* ------------------------------------------------------------------
    * getEoj(eoj, epc_list, release)
    * - 指定の EOJ から EOJ 自身の情報とプロパティの情報を返す
    * 
    * [引数]
    * - eoj      | String | 必須 | EOJ 上位 2 バイトの 16 進数表記 (例: "0130")
    * - epc_list | Array  | 任意 | EPC のリスト (例: ["80"])
    * - release  | String | 任意 | リリース番号 (例: "J") または "latest"
    * 
    * - epc_list を指定すると、指定された EPC のみにフィルターする
    * - release を指定すると、指定のリリースバージョンにそぐわない EPC は除外する
    * - もし epc_list を指定せずに release を指定したい場合は、epc_list を
    *   null にする (例: getEoj('0130', null, 'J'))
    * - もし release に不正な値が指定されたらエラーにせず this._standard_version
    *   を適用する
    * - release が指定されなかったときも同様
    * 
    * [戻値]
    * {
    *   "eoj": "0130",
    *   "release": "L",
    *   "validRelease": { "from": "A", "to": "latest" },
    *   "className": { "ja": "家庭用エアコン", "en": "Home air conditioner" },
    *   "shortName": "homeAirConditioner",
    *   "elProperties": {
    *     "80": {
    *       "epc": "80",
    *       "validRelease": { "from": "A", "to": "latest" },
    *       "propertyName": { "ja": "動作状態", "en": "Operation status" },
    *       "shortName": "operationStatus",
    *       "accessRule": { "get": "required", "set": "optional", "inf": "required"　},
    *       "descriptions": {
    *         "ja": "ON/OFFの状態を示す",
    *         "en": "This property indicates the ON/OFF status."
    *       },
    *       "data": {
    *         "type": "state",
    *         "size": 1,
    *         ...
    *       },
    *     },
    *     ...
    *   }
    * }
    * 
    * - MRA では elProperties の型は Array だが、ここでは EPC をキーとした 
    *   Object に変換して返す。
    * ---------------------------------------------------------------- */
    getEoj(eoj, epc_list, release) {
        // 引数 eoj をチェック
        if (!eoj || typeof (eoj) !== 'string') {
            return null;
        }
        eoj = eoj.replace(/^0x/, '');
        if (!/^[0-9A-Fa-f]{4,}$/.test(eoj)) {
            return null;
        }
        eoj = eoj.substring(0, 4).toUpperCase();

        // 引数 release のチェック
        if (release) {
            if (typeof (release) !== 'string' || !/^[a-zA-Z]$/.test(release)) {
                release = this._standard_version;
            }
            release = release.toUpperCase();
            if (release > this._standard_version) {
                release = this._standard_version;
            }
        } else {
            release = this._standard_version;
        }

        // 指定の EOJ のデータを検索
        if (!(eoj in this._devices)) {
            return null;
        }

        let data = JSON.parse(JSON.stringify(this._devices[eoj]));
        data.release = release;

        // リリース番号から不必要なプロパティ情報を除外
        // また、elProperties を Array から EPC をキーにした Object へ変換
        let props = {};
        for (let prop of data.elProperties) {
            let valid = true;
            if (prop.validRelease) {
                let from = prop.validRelease.from;
                let to = prop.validRelease.to;
                if (release === 'latest') {
                    if (to !== 'latest') {
                        valid = false;
                    }
                } else {
                    if (from && from > release) {
                        valid = false;
                    }
                    if (to && to !== 'latest' && to < release) {
                        valid = false;
                    }
                }
            }
            if (valid === true) {
                props[prop.epc] = prop;
            }
        }
        delete data.elProperties;
        data.elProperties = props;

        // EPC リストが与えられていればフィルタリング
        if (epc_list && Array.isArray(epc_list) && epc_list.length > 0) {
            let props = {};
            for (let epc of epc_list) {
                epc = epc.toUpperCase();
                if (data.elProperties[epc]) {
                    props[epc] = data.elProperties[epc];
                }
            }
            data.elProperties = props;
        }

        // elProperties を EPC 順に入れなおす
        let sorted_epc_list = Object.keys(data.elProperties);
        sorted_epc_list.sort();
        let sorted_props = {};
        for (let epc of sorted_epc_list) {
            sorted_props[epc] = data.elProperties[epc];
        }
        data.elProperties = sorted_props;

        return data;

    }

    /* ------------------------------------------------------------------
    * getRelease()
    * - MRA のリリースバージョンを返す
    * 
    * [引数]
    * - なし
    * 
    * [戻値]
    * - MRA のリリースバージョン (例: "M")
    * ---------------------------------------------------------------- */
    getRelease() {
        return this._standard_version
    };

    /* ------------------------------------------------------------------
    * getMetaData()
    * - MRA のメタ情報を返す
    *
    * [引数]
    * - なし
    * 
    * [戻値]
    * {
    *   "date": "2021-12-01",
    *   "release": "M",
    *   "dataVersion": "1.0.1b1",
    *   "formatVersion": "1.0.0",
    *   "note": {
    *     "ja": "Machine Readable Appendix V1.0.1",
    *     "en": "Machine Readable Appendix V1.0.1"
    *   },
    *   "Copyright": "(C) 2021 Kanagawa Institute of Technology, ECHONET CONSORTIUM"
    * }
    * ---------------------------------------------------------------- */
    getMetaData() {
        return JSON.parse(JSON.stringify(this._meta.metaData));
    };

    /* ------------------------------------------------------------------
    * getReleaseList()
    * - 有効なリリースバージョンのリストを返す
    * - ダッシュボード用
    * 
    * [引数]
    * - なし
    * 
    * [戻値]
  
    * ---------------------------------------------------------------- */
    getReleaseList() {
        const v = this._standard_version;
        const latest_code = v.charCodeAt(0);
        const list = [];
        for (let code = 0x41; code <= latest_code; code++) {
            const rel = String.fromCharCode(code);
            if (rel !== 'O') {
                list.push(rel);
            }
        }
        return list;
    }

}

const mMra = new Mra();
mMra.init();
module.exports = mMra;
