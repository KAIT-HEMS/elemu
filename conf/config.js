/* ------------------------------------------------------------------
* config.js
*   設定ファイル
* ---------------------------------------------------------------- */
module.exports = {

	/* **************************************************************
	* ダッシュボードの HTTP/WebSocket ポート番号
	* ************************************************************ */
	"dashboard_port": 8880,

	/* **************************************************************
	* ダッシュボードの HTTP レスポンスタイムアウトの秒数
	* ************************************************************ */
	"dashboard_timeout_sec": 30,


	/* ##############################################################
	# 以降は、ダッシュボードでも変更可能な設定
	# はじめてエミュレータを起動したときのデフォルト値として機能する
	############################################################## */

	/* **************************************************************
	* 言語
	* - "ja" または "en"
	* ************************************************************ */
	"lang": "ja",

	/* **************************************************************
	* IP アドレスのバージョン
	* - 4 または 6 のいずれかを指定
	* ************************************************************ */
	"ip_address_version": 4,

	/* **************************************************************
	* パケットログ
	* - true: パケットログを出力する, false: 出力しない
	* - ログは logs/packet.YYYY-MM-DD.log に出力される。(1日1ファイル)
	* ************************************************************ */
	"packet_log": true,

	/* **************************************************************
	* パケットログ保存日数
	* - 指定の日数分のパケットログを残します。
	* - 本プログラム起動時、その後、定期的に過去ログファイルを削除します。
	* ************************************************************ */
	"packet_log_days": 3,

	/* **************************************************************
	* 一斉同報によるリクエストに対する応答の待ち時間の範囲
	* - 待ち時間の範囲の中でランダムに待ち時間を決めて応答する
	* - node.js ではパケットの宛先 IP アドレスを取得できないため、
	*   マルチキャストによって送信されたパケットかどうかが分からない。
	*   そのため、DEOJ のインスタンスコードが 00 の場合を一斉同報による
	*   リクエストとみなす。
	* - 有効な値は 1 ～ 10000
	* ************************************************************ */
	"multicast_response_wait_min_msec": 100,
	"multicast_response_wait_max_msec": 1000,

	/* **************************************************************
	* EL パケット応答時間のデフォルト値 (ミリ秒)
	* - 本エミュレーターに Get や SetC などを受信した際に、その応答の
	*   待ち時間をミリ秒で指定する。
	* - 有効な値は 0 ～ 100000
	* - 一斉同報によるリクエストに対する応答時間については、本設定ではなく、
	*   以下の設定パラメータにて調整する:
	*   - multicast_response_wait_min_msec
	*   - multicast_response_wait_max_msec
	* ************************************************************ */
	"get_res_wait_msec": 100, // Get_Res を返す際の応答時間
	"set_res_wait_msec": 100, // Set_Res を返す際の応答時間
	"inf_res_wait_msec": 100, // INF/INFC_Res を返す際の応答時間

	/* **************************************************************
	* EPC データセットの時間のデフォルト値 (ミリ秒)
	* - 外部から SetI/SetC を受けたとき、実際に値を書き込む時間
	* - Set_Res などは、実際に値を書き込んだかどうかに関わらず返信
	* - ダッシュボードから EPC データセットを受けた場合 (Web API) は
	*   適用されない (即時書き込み)
	* ************************************************************ */
	"epc_data_setting_time_msec": 100,

	/* **************************************************************
	* 送信専用ノードのインスタンス通知アナウンスの送信間隔 (秒)
	* - ノードプロファイルが送信専用ノード (EOJ: 0x0E0F02) の場合にのみ
	*   適用される
	* ************************************************************ */
	"instance_announce_interval_sec": 60,

	/* **************************************************************
	* 送信専用ノードのプロパティ値通知アナウンスの送信間隔 (秒)
	* - ノードプロファイルが送信専用ノード (EOJ: 0x0E0F02) の場合にのみ
	*   適用される
	* ************************************************************ */
	"property_announce_interval_sec": 60

};