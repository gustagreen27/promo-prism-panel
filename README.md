# Campanha Disparos

Preciso construir um painel administrativo para criação e gerenciamento de campanhas.

A ideia é que, dentro do painel, eu consiga criar uma campanha informando um nome, por exemplo:

Disparos Magistrar — Dia 26

Ao criar essa campanha, o sistema deve gerar automaticamente uma URL amigável com slug, por exemplo:

/disparos-magistrar-dia-26

Dentro dessa página gerada, eu quero conseguir inserir uma URL de destino externa, que será carregada em tela cheia através de um iframe, ocupando 100% da página.

Além disso, o sistema deve registrar os acessos/cliques dessa campanha usando a API do IP-API Members, coletando informações como IP, localização aproximada, país, cidade, provedor, dispositivo, navegador, origem do acesso e horário do clique.

O objetivo é ter um painel onde eu consiga:

Criar campanhas com nome e slug personalizado;

Definir a URL de destino que será exibida no iframe;

Gerar uma página pública para cada campanha;

Monitorar todos os acessos e cliques;

Visualizar métricas por campanha;

Registrar dados de tráfego usando IP-API Members;

Ter um histórico completo de acessos para análise de performance.

O iframe precisa carregar a página de destino de forma completa, responsiva e ocupando toda a tela, como se fosse uma página própria da campanha.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://promo-prism-panel.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9c7682d6-edcd-4388-a36c-36249d4d6ab8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
