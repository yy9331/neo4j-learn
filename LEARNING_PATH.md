# Neo4j 学习路线图

基于西游记人物关系图(15 节点 + 26 关系)分阶段练习。每个知识点配一个可直接在 Browser 跑的查询和练习题。

> 学习数据由 [import.js](import.js) 一键导入(先清空再建,幂等)。练习前确保 Neo4j 已启动 + 数据已导入。

## 当前进度

| 阶段 | 状态 | 备注 |
|------|------|------|
| 第 1 阶段:Cypher 查询基础 | ✅ 已完成 | 见下方"第 1 阶段易错点" |
| 第 2 阶段:图遍历(核心) | ⏳ 待开始 | 变长路径、最短路径 |
| 第 3 阶段:写入与数据建模 | ⏳ 待开始 | SET/REMOVE、多标签、方向设计 |
| 第 4 阶段:索引与性能 | ⏳ 待开始 | 索引、EXPLAIN/PROFILE |
| 第 5 阶段:高级 Cypher | ⏳ 待开始 | 子查询、列表推导、CASE WHEN |
| 第 6 阶段:生产实践 | ⏳ 选学 | driver 单例、APOC、GDS、备份 |

---

## 第 1 阶段:Cypher 查询基础 ✅

### 1.1 知识点清单

| 知识点 | 干什么 | 状态 |
|--------|--------|------|
| `MATCH` 多 pattern | 一次匹配多个节点模式 | ✅ |
| `WHERE` 过滤 | 条件筛选(=、IN、CONTAINS、正则) | ✅ |
| `RETURN` + 别名 | 结果重命名 | ✅ |
| `ORDER BY` + `LIMIT` | 排序分页 | ✅ |
| `DISTINCT` | 去重 | ✅ |
| 聚合 `count/collect` | 统计、收集 | ✅ |
| `WITH` 子句 | 流水线中间传递 | ✅ |

### 1.2 示例查询(直接跑)

```cypher
-- 1) 多 pattern
MATCH (a:Person {name:'唐僧'}), (b:Person {name:'如来佛祖'})
RETURN a.role AS 唐僧角色, b.role AS 如来角色;

-- 2) WHERE + IN + CONTAINS
MATCH (p:Person) WHERE p.role IN ['主角', '佛门'] RETURN p.name, p.role;
MATCH (p:Person) WHERE p.name CONTAINS '悟空' RETURN p.name;

-- 3) 别名 + 中文列名
MATCH (p:Person) RETURN p.name AS 姓名, p.role AS 角色;

-- 4) 排序分页
MATCH (p:Person) RETURN p.name ORDER BY p.name ASC SKIP 3 LIMIT 5;

-- 5) 去重 + 聚合
MATCH (p:Person) RETURN DISTINCT p.role;
MATCH (p:Person) RETURN p.role, count(p) AS 人数 ORDER BY 人数 DESC;

-- 6) collect 把多行聚成数组
MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p)
RETURN collect(p.name) AS 度化名单;

-- 7) WITH 流水线(先聚合再过滤)
MATCH (p:Person)
WITH p.role AS r, count(p) AS n
WHERE n > 1
RETURN r, n;
```

### 1.3 对应的 cypher-builder 写法

> 项目惯例:动态/批量场景(导入、参数化查询)用 `@neo4j/cypher-builder` 构造,简单的只读查询直接写 Cypher 字符串更直观。下面把 1.2 的 7 个示例逐一改写成 cypher-builder,生成的 Cypher 会和 1.2 完全一致,可以对照学习。

**通用执行模板**(每个示例都遵循):

```js
import neo4j from 'neo4j-driver';
import { Match, Node, NamedNode, Param, Pattern, count, collect, and, or, eq, inOp, contains } from '@neo4j/cypher-builder';

const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'your_password'));
const session = driver.session();

// 构造 clause → build() 拿到 { cypher, params } → session.run
async function run(clause) {
  const { cypher, params } = clause.build();
  console.log('生成 Cypher:', cypher);
  return session.run(cypher, params);
}
```

#### 1) 多 pattern — 查唐僧 + 如来的 role

```cypher
MATCH (a:Person {name:'唐僧'}), (b:Person {name:'如来佛祖'})
RETURN a.role AS 唐僧角色, b.role AS 如来角色;
```

```js
const a = new NamedNode('a');
const b = new NamedNode('b');
const clause = new Match(
  new Pattern(a, { labels: ['Person'], properties: { name: new Param('唐僧') } })
).match(
  new Pattern(b, { labels: ['Person'], properties: { name: new Param('如来佛祖') } })
).return(
  [a.property('role'), '唐僧角色'],
  [b.property('role'), '如来角色'],
);
await run(clause);
```

> 💡 两个 API 坑:
> - Pattern 的 `properties` 值**必须用 `new Param(...)` 包装**,不能传裸字符串
> - 别名不用 `.as()`,而是用**二元数组** `[expr, '别名']`,多个字段用**多参数**(不是嵌套数组)


#### 2) WHERE + IN + CONTAINS

```cypher
MATCH (p:Person) WHERE p.role IN ['主角','佛门'] RETURN p.name, p.role;
MATCH (p:Person) WHERE p.name CONTAINS '悟空' RETURN p.name;
```

```js
import { Match, NamedNode, Param, Pattern, in as inOp, contains } from '@neo4j/cypher-builder';

const p = new NamedNode('p');

// WHERE p.role IN ['主角','佛门']
const clause1 = new Match(new Pattern(p, { labels: ['Person'] }))
  .where(inOp(p.property('role'), new Param(['主角', '佛门'])))
  .return(p.property('name'), p.property('role'));

// WHERE p.name CONTAINS '悟空'
const clause2 = new Match(new Pattern(p, { labels: ['Person'] }))
  .where(contains(p.property('name'), new Param('悟空')))
  .return(p.property('name'));
```

> 💡 关键点:
> - `in` 是 JS 保留字,cypher-builder 把 `inOp` 导出为 `in`,导入时必须 `import { in as inOp }`,然后用 `inOp(...)` 调用
> - 所有比较函数(`eq`/`neq`/`gt`/`lt`/`inOp`/`contains`/`matches`)签名都是 `(leftExpr, rightExpr)`,右边也必须是 Expr(`Param` / `Literal`),不能传裸字符串
> - 多个字段 return 用多参数:`.return(a, b)`,不要写成数组 `.return([a, b])`

#### 3) 别名 + 中文列名

```cypher
MATCH (p:Person) RETURN p.name AS 姓名, p.role AS 角色;
```

```js
const p3 = new NamedNode('p3');
const clause = new Match(new Pattern(p3, { labels: ['Person'] }))
  .return(
    [p3.property('name'), '姓名'],
    [p3.property('role'), '角色'],
  );
```

#### 4) 排序分页

```cypher
MATCH (p:Person) RETURN p.name ORDER BY p.name ASC SKIP 3 LIMIT 5;
```

```js
const p4 = new NamedNode('p4');
const clause = new Match(new Pattern(p4, { labels: ['Person'] }))
  .return(p4.property('name'))
  .orderBy([p4.property('name'), 'ASC'])
  .skip(3)
  .limit(5);
```

> 💡 `orderBy` 接受多参数,每个参数是 `[expr, 'ASC'|'DESC']` 或 `expr`(默认 ASC)。多字段排序:`.orderBy([a, 'DESC'], [b, 'ASC'])`。

#### 5) 去重 + 聚合

```cypher
MATCH (p:Person) RETURN DISTINCT p.role;
MATCH (p:Person) RETURN p.role, count(p) AS 人数 ORDER BY 人数 DESC;
```

```js
import { count } from '@neo4j/cypher-builder';

// DISTINCT
const p5 = new NamedNode('p5');
const clause1 = new Match(new Pattern(p5, { labels: ['Person'] }))
  .return(p5.property('role'))
  .distinct();

// count + 分组排序
const p5b = new NamedNode('p5b');
const nExpr = count(p5b);  // 复用同一个聚合表达式
const clause2 = new Match(new Pattern(p5b, { labels: ['Person'] }))
  .return(
    p5b.property('role'),
    [nExpr, '人数'],
  )
  .orderBy([nExpr, 'DESC']);
```

> 💡 把 `count(p)` 赋值到一个变量 `nExpr` 复用,既给 RETURN 用又给 ORDER BY 用,生成的 Cypher 里 `count(this0)` 会出现两次(Neo4j 会自动识别为同一个聚合)。不要用字符串别名在 `orderBy` 里排序,要传表达式本身。

#### 6) collect 把多行聚成数组

```cypher
MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p)
RETURN collect(p.name) AS 度化名单;
```

```js
import { collect } from '@neo4j/cypher-builder';

const g = new NamedNode('g');
const p = new NamedNode('p');
const pattern = new Pattern(g, {
  labels: ['Person'],
  properties: { name: new Param('观音菩萨') },
})
  .related(null, { type: '度化' })  // 默认 direction: 'right'
  .to(p);

const clause = new Match(pattern).return(
  [collect(p.property('name')), '度化名单'],
);
```

> 💡 关系模式用 `new Pattern(nodeA).related(relVar, {type, direction}).to(nodeB)`。`relVar` 传 `null` 表示不命名关系变量,`direction` 默认 `right`,可选 `left` / `undirected`。

#### 7) WITH 流水线(先聚合再过滤)

```cypher
MATCH (p:Person)
WITH p.role AS r, count(p) AS n
WHERE n > 1
RETURN r, n;
```

```js
import { With, gt, count, NamedVariable } from '@neo4j/cypher-builder';

const p = new NamedNode('p');
const r = new NamedVariable('r');
const n = new NamedVariable('n');

const clause = new Match(new Pattern(p, { labels: ['Person'] }))
  .with(
    [p.property('role'), r],
    [count(p), n],
  )
  .where(gt(n, new Param(1)))
  .return(r, n);
```

> 💡 `WITH` 子句的 API 和 `RETURN` 几乎一样,`.with(...)` 接受多参数,每个是 `[expr, alias]`,alias 可以是字符串或 `Variable`。后续 `WHERE` 要引用 WITH 的别名,**必须用 `Variable` 作为 alias 而不是字符串**,否则在 cypher-builder 里没法引用到。
> 💡 比较运算符函数:`gt` (>), `gte` (>=), `lt` (<), `lte` (<=), `eq` (=), `neq` (<>),右边也必须是 `new Param(...)` 包装的 Expr。

### 1.3.1 什么时候用 cypher-builder,什么时候直接写 Cypher?

| 场景 | 推荐 |
|------|------|
| 动态构造(类型、属性来自变量) | cypher-builder |
| 批量导入(UNWIND + CREATE) | cypher-builder(见 import.js) |
| 参数化查询(用户输入) | cypher-builder(自动防注入) |
| 一次性只读查询、对数据非常熟悉 | 直接写 Cypher 字符串 |
| 复杂图遍历(shortestPath、变长路径) | 直接写 Cypher(cypher-builder 对这类支持不完整) |

**原则:** 越是动态、批量、对外暴露的查询,越值得用 cypher-builder;越是固定的一次性查询,直接写 Cypher 反而清晰。

### 1.4 易错点(本次练习踩过的坑)

#### ❌ 易错 1:`OR` vs `AND` 混淆

**题目:** 查出名字带"王"的凡人或妖魔。

**错误答案(并集):**

```cypher
MATCH (p:Person)
WHERE p.name =~ '.*王.*' OR p.role = '妖魔'
RETURN p;
```

错在:会返回所有妖魔(包括名字不带"王"的白骨精、红孩儿)。

**正确答案(交集):**

```cypher
MATCH (p:Person)
WHERE p.name =~ '.*王.*'
  AND p.role IN ['凡人', '妖魔']
RETURN p.name, p.role;
```

中文"凡人或妖魔"读起来像 OR,但意思其实是"凡人或妖魔之一",在 WHERE 里要用 `AND` 把"名字带王"和"角色属于这两个之一"连起来。

---

#### ❌ 易错 2:聚合函数没在 RETURN 里,却想在 ORDER BY 用

**错误答案:**

```cypher
MATCH (p:Person) RETURN p.role ORDER BY p.role DESC, count(p);
```

错在:`count(p)` 没出现在 RETURN 里,ORDER BY 引用不到。

**正确答案:**

```cypher
MATCH (p:Person)
RETURN p.role, count(p) AS 人数
ORDER BY 人数 DESC;
```

记住:**ORDER BY 引用的字段必须先在 RETURN 或 WITH 里出现过**。

---

#### ❌ 易错 3:同一条 MATCH 里起点终点用了相同变量名

**错误答案:**

```cypher
MATCH (p:Person {name:'观音菩萨'})-[:度化]->(p)
RETURN collect(p.name);
```

错在:起点和终点都用 `p`,Cypher 会把两者当成同一个节点,逻辑就乱了。

**正确答案(用不同变量名):**

```cypher
MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p)
RETURN collect(p.name) AS 度化名单;
```

约定俗成:起点用语义化字母(`g` = Guanyin),终点用通用字母(`p` = Person)。

---

#### ❌ 易错 4:误以为 `MATCH ... AS` 能代替 `WITH`

**错误认知:**

```cypher
MATCH (s:Person {name:'孙悟空'}) AS s  -- ❌ 语法错误
```

**真相:**
- `AS` 只能在 `RETURN` 和 `WITH` 里给字段起别名
- `MATCH (s:Person {...})` 里的 `s` 已经是变量名了,不需要 AS
- `WITH` 的真正用途是**多步查询的中间传递**(投影、过滤、聚合),单步查询根本不用

---

#### ❌ 易错 5:`=~` 正则 vs `=` 等值的选型

**习惯性写法:** `p.role =~ '妖魔'` —— 能用但啰嗦。

**更优:** `p.role = '妖魔'` —— 等值匹配更直观,通常能走索引更快。

正则 `=~` 留给真正的模糊匹配(如 `.*王.*`、`^孙.*`)。

---

### 1.5 子句顺序速记

```
MATCH → WHERE → WITH → RETURN → ORDER BY → SKIP → LIMIT
```

和 SQL 一样,ORDER BY 在最后。

### 1.6 综合小作业

```cypher
-- 查"佛门"3 个人,按名字升序,中文列名
MATCH (p:Person)
WHERE p.role = '佛门'
RETURN p.name AS 姓名, p.description AS 简介
ORDER BY p.name ASC
LIMIT 3;
```

---

## 第 2 阶段:图遍历(核心!Neo4j 的灵魂) ⏳

图数据库的价值全在这里。

### 2.1 知识点清单

| 知识点 | 干什么 | 示例 |
|--------|--------|------|
| 固定深度关系 | 查 1 跳/2 跳关系 | `MATCH (a:Person {name:'唐僧'})-[:师徒]->(b) RETURN b.name;` |
| 变长路径 `*1..3` | 查 N 跳内关系链 | `MATCH p=(a:Person {name:'唐僧'})-[*1..3]->(b) RETURN p;` |
| 任意深度 `*` | 查所有可达节点 | `MATCH p=(a:Person {name:'唐僧'})-[:师徒*]->(b) RETURN p;` |
| 最短路径 | 两人间最短链 | `MATCH p=shortestPath((a:Person {name:'唐僧'})-[*..5]-(b:Person {name:'如来佛祖'})) RETURN p;` |
| 多路径并列 | 所有最短路径 | `MATCH p=allShortestPaths((a:Person {name:'唐僧'})-[*..5]-(b:Person {name:'如来佛祖'})) RETURN p;` |
| 关系类型过滤 | 只走某种类型 | `MATCH p=(a:Person {name:'孙悟空'})-[:度化*]->(b) RETURN p;` |
| 无向遍历 `-[]-` | 不关心方向 | `MATCH (a:Person {name:'孙悟空'})-[:师徒]-(b) RETURN b.name;` |

**学习目标:** 理解"路径"概念,能用变长路径回答"谁和谁隔几层关系"。

---

## 第 3 阶段:写入与数据建模 ⏳

### 3.1 知识点清单

| 知识点 | 干什么 | 示例 |
|--------|--------|------|
| `MERGE` + `ON CREATE SET` | 幂等导入 | 见 README 第八节 |
| `SET` / `REMOVE` | 修改属性、加标签 | `MATCH (p:Person {name:'孙悟空'}) SET p.weapon = '金箍棒' RETURN p;` |
| 多标签节点 | 一个节点多种类型 | `CREATE (n:Person:Immortal {name:'镇元子'});` |
| `DELETE` vs `DETACH DELETE` | 删节点(连关系一起删) | `MATCH (p:Person {name:'白骨精'}) DETACH DELETE p;` |
| `REMOVE` 标签 | 去掉标签 | `MATCH (p:Person {name:'孙悟空'}) REMOVE p:Immortal;` |
| 关系方向设计 | 哪种方向更符合业务 | 思考:`师徒` 应该 `唐僧->悟空` 还是反向? |
| 属性 vs 关系 | 何时该建模成关系 | "年龄"是属性,"师徒"是关系 |
| 反范式 | 冗余属性换查询性能 | 把常用查询的属性复制到节点 |

**学习目标:** 给人物加武器、法力值等属性,思考"夫妻"和"师徒"该用单向还是双向关系。

---

## 第 4 阶段:索引与性能(项目变大后必学) ⏳

### 4.1 知识点清单

| 知识点 | 干什么 | 示例 |
|--------|--------|------|
| 创建索引 | 加速按属性查找 | `CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name);` |
| 索引类型 | RANGE / TEXT / POINT / LOOKUP | `CREATE TEXT INDEX ...` 用于全文搜 |
| 唯一约束 | 防重复 + 自动索引 | `CREATE CONSTRAINT ... REQUIRE p.id IS UNIQUE;` |
| `EXPLAIN` | 看查询计划不执行 | `EXPLAIN MATCH (p:Person {name:'孙悟空'}) RETURN p;` |
| `PROFILE` | 执行 + 看 DB hits | `PROFILE MATCH (p:Person {name:'孙悟空'}) RETURN p;` |
| DB hits | 衡量工作量 | DB hits 越少越快 |
| 查询优化思路 | 避免笛卡尔积、用参数化、加 LIMIT | 改写慢查询 |

**学习目标:** 用 PROFILE 对比有无索引时查孙悟空的 DB hits 差异。

---

## 第 5 阶段:高级 Cypher ⏳

### 5.1 知识点清单

| 知识点 | 干什么 | 示例 |
|--------|--------|------|
| 子查询 `CALL {}` | 独立作用域的查询 | `MATCH (p:Person) CALL { MATCH (p:Person {name:'孙悟空'}) RETURN p.weapon AS w } RETURN w;` |
| `EXISTS` 子查询 | 检查模式是否存在 | `MATCH (p:Person) WHERE EXISTS((p)-[:度化]->()) RETURN p;` |
| 列表推导 | 集合操作 | `MATCH (a:Person {name:'孙悟空'})-[:师兄弟]-(b) RETURN [x IN collect(b.name) \| x];` |
| 模式推导 | 从路径提取属性 | `MATCH p=(a:Person {name:'唐僧'})-[*1..2]->(b) RETURN [x IN nodes(p) \| x.name];` |
| `UNWIND` | 列表展开成行(导入用) | import.js 已用 |
| `FOREACH` | 对每行执行操作 | `FOREACH (r IN [{name:'a'},{name:'b'}] \| CREATE (p:Person {name:r.name}));` |
| `CASE WHEN` | 条件表达式 | `MATCH (p:Person) RETURN p.name, CASE WHEN p.role='主角' THEN '团队' ELSE '其他' END AS 分组;` |
| `UNION` / `UNION ALL` | 合并结果集 | 两个 MATCH 的结果拼接 |

**学习目标:** 用子查询找出"被观音度化过且是妖魔的人",用列表推导把路径上所有名字拼成一个数组。

---

## 第 6 阶段:生产实践(选学,看方向) ⏳

### 6.1 知识点清单

| 知识点 | 干什么 |
|--------|--------|
| 事务管理 | `session.beginTransaction()`、读写事务、回滚 |
| driver 调优 | `maxConnectionPoolSize`、`connectionAcquisitionTimeout` |
| APOC 库 | 数百个实用过程(数据转换、图操作、批处理) |
| GDS 库 | 图算法:PageRank、社区检测、相似度 |
| 备份恢复 | `neo4j-admin database dump`、`load` |
| 安全 | 角色权限、RBAC、加密 |
| 可视化 | `neovis.js`、`d3.js` 把图渲染到网页 |
| GraphQL | `@neo4j/graphql` 自动生成 API |
| 集群 | Causal Cluster、读副本、分片 |

---

## 推荐学习资源

| 资源 | 用途 |
|------|------|
| [Neo4j Cypher 官方手册](https://neo4j.com/docs/cypher-manual/current/) | 权威语法参考 |
| [Neo4j GraphAcademy](https://graphacademy.neo4j.com/) | 免费官方课程(含互动练习) |
| [Neo4j Sandbox](https://sandbox.neo4j.com/) | 免费云端实例,不用本地装 |
| 书籍《Neo4j 实战》 | 系统入门 |
| [APOC 文档](https://neo4j.com/docs/apoc/current/) | 实用过程库 |

---

## 学习进度跟踪

> 每次练习完一个阶段,把对应"状态"从 ⏳ 改为 ✅,并在该阶段下方补充踩过的坑。这样上下文清空后也能无缝续学。

### 第 1 阶段完成日期:2026-09-15

练习过的查询类型:多 pattern、WHERE、RETURN 别名、ORDER BY+LIMIT、DISTINCT、count/collect、WITH 子句。

踩过的坑:见上方 [1.4 易错点](#14-易错点本次练习踩过的坑)。

cypher-builder 对照写法:见 [1.3 对应的 cypher-builder 写法](#13-对应的-cypher-builder-写法),共 7 个示例逐一改写。
