<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Pix Inter passa pela ponte externa no Render (inter-pix-bridge, HMAC INTER_BRIDGE_SECRET): o runtime do painel ignora certificado de cliente (mTLS), confirmado em teste.
- Confirmação de Pix por consulta periódica que só fica ligada com Pix pendente, e crédito só via confirm_pix_deposit (idempotente): o webhook do Inter exige mTLS de entrada, indisponível.
