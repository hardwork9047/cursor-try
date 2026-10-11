# 型

新しい置き場は、手でコピーせずスクリプトから作ります。

| コマンド | できるもの |
| --- | --- |
| `npm run new-demo -- <slug>` | `templates/static/` から、一枚の HTML |
| `npm run new-demo -- <slug> --template vite` | `templates/vite/` から、Vite + React |
| `npm run new-tool -- <slug>` | `templates/tool/` から、CLI 用の README と tool.json |

`__SLUG__` `__TITLE__` `__DATE__` はスクリプトが置き換えます。このフォルダ自体は公開されません。
