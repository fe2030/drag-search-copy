# Drag search&copy

Drag search&copy は、テキストをドラッグ＆ドロップするだけで「検索」や「コピー」を素早く行える、軽量な Chrome 拡張機能です。
Manifest V3 に準拠し、シンプルかつ高速に動作します。

## 主な機能

1.  **ドラッグ＆ドロップアクション:** 選択したテキストを上下左右にドラッグするだけで、設定したアクション（検索、翻訳、コピーなど）を実行できます。
2.  **視覚ガイド:** ドラッグ中に実行されるアクションがアイコンで表示されます。**アイコンをクリックして即座に実行することも可能です。**
3.  **「大きくドラッグ」機能:** 通常のドラッグとは別に、大きく（100px以上）ドラッグした場合に別のアクションを割り当てることができます。
4.  **自動ローカライズ (EU対応強化):** ご利用のブラウザ言語設定に合わせて、Amazon、eBay、DeepL などのドメインを自動的に最適化します（例: イギリスなら `.co.uk`、ドイツなら `.de`）。

## インストール方法

Chrome ウェブストアで公開されています。以下のリンクからインストールできます。

[Drag search&copy - Chrome ウェブストア](https://chromewebstore.google.com/detail/drag-searchcopy/oljcaldpigfclepdplhlnfnkcopcfbpj)

## 使い方

1.  ウェブページ上の任意のテキストを選択します。
2.  選択したテキストをマウスでドラッグします。
3.  画面にアクションを示すアイコン（視覚ガイド）が表示されます。
4.  **方法A（ドラッグ）:** そのまま任意の方向にマウスを動かしてドロップします。
5.  **方法B（クリック）:** 表示されたアイコンを直接クリックします（ドラッグ距離が足りない場合などに便利です）。

### 設定の変更

ブラウザのツールバーにある **Drag search&copy のアイコンをクリック**すると、設定ポップアップが開きます。
ここで各方向（上、下、左、右）および「大きくドラッグ」時のアクションをカスタマイズできます。

## 選択可能な機能一覧

| カテゴリ | 機能 | 説明 |
|----------|------|------|
| - | なし | 何もしない |
| 検索 | Google 検索 | Google で検索 |
| 検索 | YouTube 検索 | YouTube で検索 |
| 検索 | X (Twitter) 検索 | X (Twitter) で検索 |
| 検索 | Reddit 検索 | Reddit で検索 |
| 検索 | 楽天検索 | 楽天市場で検索（日本語環境のみ表示） |
| 検索 | Amazon 検索 | 地域のAmazon（.co.jp, .com, .co.uk, .de, .fr, .it, .es）で検索 |
| 検索 | eBay | 地域のeBay（.com, .co.uk, .de, .fr, .it, .es）で検索 |
| 検索 | Google マップ | Google マップで検索 |
| 翻訳 | DeepL 翻訳 | DeepL で翻訳（ターゲット言語を自動設定） |
| 翻訳 | Google 翻訳 | Google 翻訳で翻訳（自動検出→日本語） |
| AI | ChatGPT | ChatGPT を開いてテキストを入力欄に自動入力 |
| AI | Claude | Claude を開いてテキストを入力欄に自動入力 |
| AI | Gemini | Gemini を開いてテキストを入力欄に自動入力 |
| その他 | クリップボードにコピー | テキストをコピー |

> **Note:** AI 機能（ChatGPT、Claude、Gemini）は、ページを開いた後にテキストを入力欄に自動入力しますが、送信ボタンのクリックまでは行いません。

## 技術仕様

*   **Manifest Version:** 3
*   **Permissions:**
    *   `tabs`: 新しいタブでの検索結果表示に使用
    *   `storage`: 設定保存用
    *   `scripting`: AI サービスへの自動入力スクリプト注入用
    *   `clipboardWrite`: テキストのコピー機能に使用
*   **Host Permissions:** 全ての URL (`http://*/*`, `https://*/*`) で動作

### ファイル構成

*   `manifest.json`: 拡張機能の設定ファイル（`default_popup` 設定済み）
*   `service-worker.js`: バックグラウンド処理（タブ作成、ロケール判定ロジック、AI自動入力）
*   `superdrag.js`: コンテンツスクリプト（ドラッグイベント、視覚ガイド表示・クリックイベント処理）
*   `options.html` / `options.js`: 設定画面

### 自動ローカライズロジック

`navigator.language` に基づき、以下のルールでドメインを自動選択します。

*   **Amazon:** ja -> `co.jp`, en-GB -> `co.uk`, de -> `de`, fr -> `fr`, it -> `it`, es -> `es`, 其他 -> `com`
*   **eBay:** en-GB -> `co.uk`, de -> `de`, fr -> `fr`, it -> `it`, es -> `es`, 其他 -> `com`
*   **DeepL:** 言語コードの先頭2文字をターゲット言語URLに埋め込み

## ライセンス

MIT License
