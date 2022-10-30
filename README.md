# Golos Notify Service

Сервис уведомлений для проектов на блокчейне Golos Blockchain. Позволяет:
- показывать всплывающие уведомления о различных действиях пользователей (например, "alice отблагодарила вас 1.000 GOLOS")
- мгновенно отображать личные сообщения в мессенджерах, чатах и т.д. на основе [Golos Messenger](https://github.com/golos-blockchain/golos-js/tree/master/doc#private-messages)
- подписываться на посты и получать уведомления о новых комментариях к ним

## Разворачивание своей копии сервиса

**Примечание:** Необходимо лишь в том случае, если вас не устраивает https://notify.golos.app, требуется внести какие-то изменения, или принять участие в разработке самого сервиса. В ином случае используйте API (см. ниже).

### Сборка

Сервису требуются [Docker](https://docs.docker.com/engine/install/) и [Docker-Compose](https://docs.docker.com/compose/install/).

```bash
docker-compose build
```

### Запуск

```bash
docker-compose up
```

## Для контрибьюторов

### Тестирование 

dataserver покрыт тестами Cypress. Для запуска тестов требуются [Node.js 16](https://github.com/nodesource/distributions/blob/master/README.md) и Cypress, установленный по [инструкции](https://docs.cypress.io/guides/getting-started/installing-cypress).

```bash
cd dataserver
npm install
npm test
```

### Доступ к Tarantool

Tarantool запускается на 3301 порту.

Для осмотра содержимого БД Tarantool при разработке, тестировании и диагностике можно пользоваться консолью:

```bash
$ docker-compose exec datastore tarantoolctl connect 3301
```

## Для разработчиков

Используйте Golos Notify Service и в своем приложении или игре. Для этого есть [открытое API](./docs/API.md).
