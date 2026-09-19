# Exibir telefones completos nos relatórios

## Objetivo
Remover a ocultação com asteriscos dos números exibidos e exportados nos relatórios.

## Alterações
- Mostrar o telefone completo nos logs do relatório do cliente.
- Exportar o telefone completo no CSV de logs, sem `****` ou outros caracteres de ocultação.
- Remover a máscara aplicada aos destinatários nos relatórios públicos de campanhas.
- Preservar apenas a formatação visual legível, sem apagar nenhum dígito.

## Validação
- Conferir que as tabelas e os arquivos CSV exibem os mesmos números completos armazenados.
- Verificar que não restou mascaramento de telefone nos fluxos de relatórios.
