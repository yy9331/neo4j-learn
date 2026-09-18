# neo4j-learn

Neo4j 图数据库学习仓库,使用 **西游记人物关系图** 作为练习数据。技术栈:

- Node.js(ESM)
- `neo4j-driver`(官方驱动,连接 + 执行 Cypher)
- `@neo4j/cypher-builder`(官方 Cypher 构造器,程序化生成 Cypher,不用手拼字符串)

---

## 目录

- [学习路线图(6 阶段)](LEARNING_PATH.md) — 进度跟踪、知识点清单、易错点汇总
- [一、环境准备](#一环境准备)
- [二、两个核心脚本](#二两个核心脚本)
- [三、Neo4j Browser 使用](#三neo4j-browser-使用)
- [四、LOAD CSV 与 file:/// 路径](#四load-csv-与-file-路径)
- [五、Cypher 动态关系类型的坑](#五cypher-动态关系类型的坑)
- [六、图上显示关系线和中文类型](#六图上显示关系线和中文类型)
- [七、纯 CQL 版本导入(对照 import.js)](#七纯-cql-版本导入对照-importjs)
- [八、CREATE vs MERGE + 唯一约束](#八create-vs-merge--唯一约束)
- [九、@neo4j/cypher-builder API 速查](#九neo4jcypher-builder-api-速查)
- [十、常见报错对照](#十常见报错对照)

---

## 一、环境准备

### 1.1 启动 Neo4j(Docker,推荐)

```bash
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your_password \
  neo4j:5
```

端口说明:

| 端口 | 协议 | 用途 |
|------|------|------|
| 7687 | Bolt | driver 连接(推荐,原生高性能) |
| 7474 | HTTP | Neo4j Browser + REST API |
| 7473 | HTTPS | 浏览器加密访问(默认未启用,需配 TLS 证书) |

> 学习阶段用 Bolt(`bolt://localhost:7687`)即可,HTTPS 没必要折腾。

### 1.2 安装依赖

```bash
npm install
```

`package.json` 关键配置(`"type": "module"` 启用 ESM):

```json
{
  "type": "module",
  "dependencies": {
    "@neo4j/cypher-builder": "^3.3.0",
    "neo4j-driver": "^6.2.0"
  }
}
```

> ⚠️ `@neo4j/cypher-builder` 要求 Node.js ≥ 20。

### 1.3 连接凭据

默认值硬编码在脚本里,可用环境变量覆盖:

```bash
# 方式 A:命令行传环境变量(零依赖)
NEO4J_PASSWORD=你的密码 node index.js

# 方式 B:用 .env 文件(需额外装 dotenv)
echo "NEO4J_PASSWORD=你的密码" > .env
```

> `process.env` 是 Node 内置全局,不需要装任何库。只有用 `.env` 文件时才需要 `dotenv`。

---

## 二、两个核心脚本

### 2.1 `index.js` — 连接测试 + 清空数据库

```bash
node index.js
# 或 npm test
```

作用:
1. 创建 driver → `verifyConnectivity()` 验证连接
2. 用 cypher-builder 构造 `MATCH (n) DETACH DELETE n` 清空数据库
3. 用 cypher-builder 构造 `MATCH (n) RETURN count(n)` 确认为空
4. 打印生成的 Cypher 字符串方便对照学习

输出示例:

```
✅ Neo4j 连接成功
🗑️  数据库已清空:删除节点 15 个,关系 26 条
📊 当前节点数:0

📋 生成的 Cypher 对照:
  清空: MATCH (this0)
DETACH DELETE this0
  计数: MATCH (this0)
RETURN count(this0)
```

### 2.2 `import.js` — 导入西游记数据

```bash
node import.js
# 或 npm run import
```

作用:
1. 清空数据库
2. 从 `data/nodes.csv` 导入 15 个西游人物节点
3. 从 `data/relationships.csv` 按 `relation_type` 分组导入 26 条关系
4. 验证节点和关系数量

脚本会打印 cypher-builder 生成的 Cypher,比如节点导入:

```
UNWIND $param0 AS row
CREATE (p:Person { id: row.id, name: row.name, role: row.role, description: row.description })
```

关系导入(每种类型单独一条):

```
UNWIND $param0 AS row
MATCH (a:Person { id: row.from_id })
MATCH (b:Person { id: row.to_id })
CREATE (a)-[:`师徒` { description: row.description }]->(b)
```

> 脚本是幂等的:每次先清空再导入,重复运行不会产生重复数据。

### 2.3 数据文件

| 文件 | 内容 |
|------|------|
| [data/nodes.csv](data/nodes.csv) | 15 个人物:唐僧师徒 + 白龙马 + 观音/如来 + 玉帝/王母 + 牛魔王一家 + 白骨精 + 镇元子 + 女儿国国王 |
| [data/relationships.csv](data/relationships.csv) | 26 条关系:师徒、结拜、夫妻、父子、降妖、度化等 |

---

## 三、Neo4j Browser 使用

打开 **http://localhost:7474**,登录 `neo4j` / `your_password`,Connect URL 选 `bolt://localhost:7687`。

### 3.1 看图的关键:返回路径,不要只返回节点

```cypher
-- ❌ 只返回节点,图上只有点没有线
MATCH (n:Person) RETURN n LIMIT 25;

-- ✅ 返回路径,图上有点也有线
MATCH p=()-[]->() RETURN p LIMIT 30;

-- ✅ 或显式返回节点 + 关系 + 节点
MATCH (a)-[r]->(b) RETURN a, r, b LIMIT 30;
```

### 3.2 让关系线显示中文类型

cypher-builder 生成的 Cypher 把关系类型直接写成中文(如 `:师徒`),所以图上默认就显示中文,不需要额外设置。

如果想显示更详细的描述:
1. 点击 Graph 视图下方的关系类型六边形
2. 在 Captions 下拉里选 `description`

### 3.3 常用查询练习

```cypher
-- 看孙悟空的所有关系
MATCH (s:Person {name:'孙悟空'})-[r]-(p) RETURN s, r, p;

-- 只看师徒关系
MATCH p=()-[:师徒]->() RETURN p;

-- 找观音度化过的人
MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p) RETURN p.name;

-- 找两人间最短路径
MATCH p=shortestPath((a:Person {name:'唐僧'})-[*..5]-(b:Person {name:'如来佛祖'}))
RETURN p;
```

---

## 四、LOAD CSV 与 file:/// 路径

在 Browser 里用 `LOAD CSV` 时,`file:///` 的路径规则:

| 写法 | 实际位置 |
|------|---------|
| `file:///nodes.csv` | 容器内 `/var/lib/neo4j/import/nodes.csv` |
| `file:///sub/file.csv` | 容器内 `/var/lib/neo4j/import/sub/file.csv` |
| `file:////tmp/file.csv` | 绝对路径(需要额外权限,默认禁用) |

### 4.1 把 CSV 复制进容器

```bash
docker cp data/nodes.csv neo4j:/var/lib/neo4j/import/nodes.csv
docker cp data/relationships.csv neo4j:/var/lib/neo4j/import/relationships.csv
```

### 4.2 如果报 `ExternalResourceFailed: Couldn't load the external resource`

原因:容器内 `import` 目录权限不对。修复:

```bash
docker exec -u root neo4j chown -R neo4j:neo4j /var/lib/neo4j/import
docker restart neo4j
```

### 4.3 在 Browser 里执行 LOAD CSV

```cypher
-- 导入节点
LOAD CSV WITH HEADERS FROM 'file:///nodes.csv' AS row
CREATE (p:Person {
  id: row.id,
  name: row.name,
  role: row.role,
  description: row.description
});

-- 导入关系(每种类型一条,详见第七节)
LOAD CSV WITH HEADERS FROM 'file:///relationships.csv' AS row
WITH row WHERE row.relation_type = '师徒'
MATCH (a:Person {id: row.from_id}), (b:Person {id: row.to_id})
CREATE (a)-[:师徒 {description: row.description}]->(b);
```

---

## 五、Cypher 动态关系类型的坑

### 5.1 问题

Cypher **不支持参数化关系类型**。下面这种写法是非法的:

```cypher
-- ❌ 不能用参数当关系类型
CREATE (a)-[:$type]->(b);
```

关系类型必须在写语句时就确定为一个字面量。

### 5.2 解决方案对比

| 方案 | 做法 | 优缺点 |
|------|------|--------|
| **按类型分组**(import.js 用) | 每种类型写一条 CREATE | 纯 Cypher 可行,类型多时语句冗长 |
| **APOC `apoc.create.relationship`** | 动态创建关系 | 一条语句搞定,但需要装 APOC 插件 |
| **固定类型 + 属性** | `CREATE (a)-[:RELATION {type: row.relation_type}]->(b)` | 简单但图上显示 "RELATION",不直观 |

### 5.3 APOC 不可用说明

本项目的 Neo4j 5.26 + APOC 5.26 有 `commons-lang3` 版本冲突,装了容器起不来。所以 import.js 采用"按类型分组"方案。如果将来 APOC 可用,可以这样写:

```cypher
LOAD CSV WITH HEADERS FROM 'file:///relationships.csv' AS row
MATCH (a:Person {id: row.from_id}), (b:Person {id: row.to_id})
CALL apoc.create.relationship(a, row.relation_type, {description: row.description}, b) YIELD rel
RETURN count(rel);
```

---

## 六、图上显示关系线和中文类型

### 6.1 为什么有时候图上没有箭头线?

不是数据问题,是**查询返回了什么**的问题:

| 查询 | 图上显示 |
|------|---------|
| `RETURN n`(只返回节点) | 只有点,没有线 |
| `RETURN p`(返回路径) | 有点有线 |
| `RETURN a, r, b`(显式返回关系) | 有点有线 |

### 6.2 让线显示中文关系名

关系类型本身是中文(`:师徒`),默认就会显示。如果想显示 `description` 属性:点击底部关系类型六边形 → Captions → 选 `description`。

---

## 七、纯 CQL 版本导入(对照 import.js)

完全不用 import.js,在 Browser 里逐条执行:

### 第 1 步:清空

```cypher
MATCH (n) DETACH DELETE n;
```

### 第 2 步:导入节点(1 条)

```cypher
LOAD CSV WITH HEADERS FROM 'file:///nodes.csv' AS row
CREATE (p:Person {
  id: row.id,
  name: row.name,
  role: row.role,
  description: row.description
});
```

### 第 3 步:导入关系(每种类型一条)

模板:

```cypher
LOAD CSV WITH HEADERS FROM 'file:///relationships.csv' AS row
WITH row WHERE row.relation_type = '类型名'
MATCH (a:Person {id: row.from_id}), (b:Person {id: row.to_id})
CREATE (a)-[:类型名 {description: row.description}]->(b);
```

需要执行 15 次,把 `类型名` 换成:师徒、坐骑、师兄弟、度化、镇压、敌对、结拜兄弟、夫妻、父子、母子、收徒、降妖、故交、结拜、爱慕。

### 第 4 步:验证

```cypher
MATCH (p:Person) RETURN count(p);   -- 15
MATCH ()-[r]->() RETURN count(r);   -- 26
MATCH p=()-[]->() RETURN p LIMIT 30; -- 看图
```

### import.js 干了什么对照表

| import.js 里的代码 | 对应 CQL |
|--------------------|---------|
| `MATCH (n) DETACH DELETE n` | 第 1 步 |
| `UNWIND $rows ... CREATE` 节点 | 第 2 步 LOAD CSV |
| JS 里 `byType` 分组 + for 循环 | 第 3 步那 15 条 `WHERE` 语句 |

---

## 八、CREATE vs MERGE + 唯一约束

### 8.1 两种写入关键字

| 关键字 | 行为 | 重复运行 |
|--------|------|---------|
| `CREATE` | 无脑新建,不管已存在什么 | 会产生重复节点 |
| `MERGE` | 先查找,没有才创建 | 不会重复(基于匹配条件) |

import.js 用 `CREATE` + "先清空" 保证幂等,简单但每次全量重建。

### 8.2 更健壮的写法:约束 + MERGE

适合真实项目的增量导入,重复运行安全:

```cypher
-- 先建唯一约束(只需执行一次)
CREATE CONSTRAINT person_id_unique IF NOT EXISTS
FOR (p:Person) REQUIRE p.id IS UNIQUE;

-- 用 MERGE 代替 CREATE
LOAD CSV WITH HEADERS FROM 'file:///nodes.csv' AS row
MERGE (p:Person {id: row.id})
ON CREATE SET p.name = row.name, p.role = row.role, p.description = row.description;

-- 关系也用 MERGE
LOAD CSV WITH HEADERS FROM 'file:///relationships.csv' AS row
WITH row WHERE row.relation_type = '师徒'
MATCH (a:Person {id: row.from_id}), (b:Person {id: row.to_id})
MERGE (a)-[:师徒]->(b);
```

`ON CREATE SET` 只在新建时设置属性,已存在的节点不会被覆盖。

---

## 九、@neo4j/cypher-builder API 速查

### 9.1 为什么用

- 不拼字符串,防 Cypher 注入
- 参数化自动处理(生成的 `$param0` 等名字自动管理)
- 支持链式构造 MATCH/WHERE/CREATE/RETURN
- **不需要数据库连接就能生成 Cypher**,生成的语句可以直接喂给 `session.run()`

### 9.2 核心 API

```js
import {
  Match, Node, Param, Pattern, Unwind, count, NamedVariable, NamedNode
} from '@neo4j/cypher-builder';
```

| 类/函数 | 用途 |
|---------|------|
| `Node` / `NamedNode('p')` | 节点变量引用 |
| `Pattern` | 构造节点/关系 pattern |
| `Param(value)` | 参数化值 |
| `NamedVariable('row')` | 命名变量(配合 UNWIND 用) |
| `Match` / `Create` / `Unwind` | 子句 |
| `count(node)` | 聚合函数 |

### 9.3 常见模式

**清空:**

```js
const n = new Node();
const q = new Match(new Pattern(n)).detachDelete(n);
// MATCH (this0) DETACH DELETE this0
```

**带参数的 MATCH:**

```js
const a = new Node();
const q = new Match(new Pattern(a, { labels: ['Person'] }))
  .where(eq(a.property('id'), new Param('myid')))
  .return(a);
// MATCH (this0:Person) WHERE this0.id = $param0 RETURN this0
```

**UNWIND 批量导入节点:**

```js
const row = new NamedVariable('row');
const p = new NamedNode('p');
const pattern = new Pattern(p, {
  labels: ['Person'],
  properties: { id: row.property('id'), name: row.property('name') }
});
const q = new Unwind([new Param(rows), row]).create(pattern);
// UNWIND $param0 AS row CREATE (p:Person { id: row.id, name: row.name })
```

**关系 CREATE(单 MATCH 双 pattern):**

```js
const a = new NamedNode('a');
const b = new NamedNode('b');
const relPattern = new Pattern(a)
  .related(null, { type: '师徒', direction: 'right' })
  .to(b);
const q = new Match(patternA).match(patternB).create(relPattern);
```

**执行:**

```js
const { cypher, params } = q.build();
const res = await session.run(cypher, params);
```

### 9.4 调试技巧

`q.build()` 返回 `{ cypher, params }`,打印出来对照学习:

```js
const { cypher, params } = q.build();
console.log(cypher);    // 生成的 Cypher 字符串
console.log(params);    // 参数对象
```

---

## 十、常见报错对照

| 报错 | 原因 | 解决 |
|------|------|------|
| `ServiceUnavailable: Could not perform discovery` | Neo4j 没启动或 URI 端口错 | 检查 Docker 容器状态,URI 用 `bolt://localhost:7687` |
| `Neo4jError: The client is unauthorized` | 密码错 | 首次安装用 `neo4j` 登录改密码,或重建容器用 `NEO4J_AUTH=neo4j/你的密码` |
| `NeoClientError: ProtocolError` | URI scheme 不对 | 本地用 `bolt://` 或 `neo4j://`,Aura 云端用 `neo4j+s://` |
| `ExternalResourceFailed: Couldn't load the external resource at: file:///...` | 容器内找不到文件或权限不对 | `docker cp` 复制到 `/var/lib/neo4j/import/`,再 `chown -R neo4j:neo4j` |
| `Cannot load from URL 'file:///node.csv'` | 文件名拼错 | 检查是 `nodes.csv` 不是 `node.csv` |
| 图上没有箭头线 | 查询只返回了节点 | 用 `MATCH p=()-[]->() RETURN p` 返回路径 |

---

## 项目结构

```
neo4j-learn/
├── README.md              # 本文档
├── LEARNING_PATH.md       # 学习路线图(6 阶段进度 + 易错点)
├── package.json           # ESM 配置 + 依赖
├── index.js               # 连接测试 + 清空数据库
├── import.js              # 导入西游记数据(用 cypher-builder)
├── data/
│   ├── nodes.csv          # 15 个人物节点
│   └── relationships.csv  # 26 条关系
└── node_modules/
```
