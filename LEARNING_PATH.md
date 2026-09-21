# Neo4j 学习路线图

基于西游记人物关系图(15 节点 + 26 关系)分阶段练习。每个知识点配一个可直接在 Browser 跑的查询和练习题。

> 学习数据由 [import.js](import.js) 一键导入(先清空再建,幂等)。练习前确保 Neo4j 已启动 + 数据已导入。

## 当前进度

| 阶段 | 状态 | 备注 |
|------|------|------|
| 第 1 阶段:Cypher 查询基础 | ✅ 已完成 | 见下方"第 1 阶段易错点" |
| 第 2 阶段:图遍历(核心) | ✅ 已完成 | 变长路径、最短路径、方向踩坑 |
| 第 3 阶段:写入与数据建模 | ✅ 已完成 | SET/REMOVE、多标签、MERGE、方向设计、建模思维 |
| 第 4 阶段:索引与性能 | ⏳ 待开始 | 索引、EXPLAIN/PROFILE、DB hits |
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

## 第 2 阶段:图遍历(核心!Neo4j 的灵魂) ✅

图数据库的价值全在这里。**关键概念:路径变量 `p`**,用 `MATCH p=()` 把整条链路(起点+关系+终点)一次性返回,Graph 视图能画出连线。

从路径里可提取:`nodes(p)` 节点列表、`relationships(p)` 关系列表、`length(p)` 跳数、`[n IN nodes(p) | n.name]` 列表推导映射。

### 2.1 知识点清单

| 知识点 | 干什么 | 状态 |
|--------|--------|------|
| 固定深度关系(1 跳/2 跳) | 查直接关系链 | ✅ |
| 变长路径 `*1..3` | 查 N 跳内关系链 | ✅ |
| 任意深度 `*` | 查所有可达节点 | ✅ |
| 最短路径 `shortestPath` | 两人间最短链 | ✅ |
| 所有最短路径 `allShortestPaths` | 所有等长最短链 | ✅ |
| 关系类型过滤 `[:A|B*]` | 只走指定类型 | ✅ |
| 无向遍历 `-[]-` | 不关心方向 | ✅ |
| 路径信息提取 | length/nodes/列表推导 | ✅ |

### 2.2 示例查询(直接跑)

```cypher
-- 1) 固定深度:观音度化的人,以及这些人降服的妖魔(2 跳)
MATCH p=(a:Person {name:'观音菩萨'})-[:度化]->(x)-[:降妖]->(y)
RETURN p;

-- 2) 变长路径:孙悟空 2 跳内能到达的所有节点
MATCH p=(a:Person {name:'孙悟空'})-[*1..2]->()
RETURN p;

-- 3) 任意深度:唐僧通过师徒关系链能传到谁
MATCH p=(a:Person {name:'唐僧'})-[:师徒*]-()
RETURN p;

-- 4) 最短路径:孙悟空到红孩儿
MATCH p = shortestPath((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'红孩儿'}))
RETURN p;

-- 5) 所有最短路径:孙悟空到铁扇公主
MATCH p = allShortestPaths((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'铁扇公主'}))
RETURN p;

-- 6) 关系类型过滤:唐僧通过师徒关系链传到谁(任意深度)
MATCH p=(a:Person {name:'唐僧'})-[:师徒*]-()
RETURN p;

-- 7) 无向遍历:红孩儿的所有家人
MATCH (s:Person {name:'红孩儿'})-[:父子|母子|夫妻]-(t)
RETURN t.name;

-- 8) 路径信息提取:孙悟空到红孩儿的最短路径详情
MATCH p = shortestPath((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'红孩儿'}))
RETURN
  b.name AS 终点,
  length(p) AS 跳数,
  [n IN nodes(p) | n.name] AS 经过的节点
ORDER BY length(p) DESC;
```

### 2.3 变长路径语法速查

| 写法 | 含义 |
|------|------|
| `[*1..3]` | 1 到 3 跳 |
| `[*1..]` | 至少 1 跳,无上限 |
| `[*..3]` | 最多 3 跳(含 0 跳) |
| `[*2]` | 恰好 2 跳 |
| `[*]` | 任意长度(慎用,可能爆炸) |
| `[:师徒*]` | 只走师徒关系,任意深度 |
| `[:师徒\|师兄弟*]` | 走师徒或师兄弟,任意深度 |

### 2.4 最短路径要点

- `shortestPath(...)` 里**只能有 1 个 path**,起点终点都要明确
- **必须用无向 `-` 或 `-[]-`**,有向 `->` 可能因方向反了查不到
- 建议加跳数上限 `[*..5]`,防止路径过长

### 2.5 易错点(本次练习踩过的坑)

#### ❌ 易错 1:有向 vs 无向搞反,查不到数据

**场景:** 查孙悟空的师傅唐僧(数据库里是 `唐僧-[:师徒]->孙悟空`)。

**错误写法(方向反了):**

```cypher
MATCH (s:Person {name:'孙悟空'})-[:师徒]->(master)
RETURN master.name;  -- ❌ 查不到!师徒方向是 唐僧->悟空,从悟空出发往外走找不到
```

**正确写法(无向或显式反方向):**

```cypher
-- 无向,两个方向都查
MATCH (s:Person {name:'孙悟空'})-[:师徒]-(master)
RETURN master.name;  -- ✅ 能找到唐僧和徒弟们

-- 或者显式反方向
MATCH (s:Person {name:'孙悟空'})<-[:师徒]-(master)
RETURN master.name;  -- ✅ 只找到唐僧
```

**一句话:** 查关系前先想清楚数据方向是什么。不确定就用无向 `-[]-`。

---

#### ❌ 易错 2:shortestPath 里用有向箭头

**错误写法:**

```cypher
MATCH p = shortestPath((a:Person {name:'孙悟空'})-[:师徒*]->(b:Person {name:'唐僧'}))
RETURN p;  -- ❌ 可能查不到,因为方向可能反了
```

**正确写法(无向):**

```cypher
MATCH p = shortestPath((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'唐僧'}))
RETURN p;  -- ✅ 不管方向都能找到
```

**一句话:** `shortestPath` / `allShortestPaths` 里统一用无向 `-`。

---

#### ❌ 易错 3:想让 Graph 视图显示连线,却只返回节点

**错误写法:**

```cypher
MATCH (a:Person)-[]->(b)
RETURN a;  -- ❌ 只返回节点,Graph 视图没有连线
```

**正确写法(返回路径或关系):**

```cypher
-- 返回路径(整条链路)
MATCH p=(a:Person)-[]->(b) RETURN p;

-- 或返回节点 + 关系 + 节点
MATCH (a:Person)-[r]->(b) RETURN a, r, b;
```

**一句话:** Graph 视图要有线,RETURN 里必须包含关系或路径。

---

## 第 3 阶段:写入与数据建模 ✅

> ⚠️ 本阶段会修改/删除数据,全部练习完后重跑 `node import.js` 恢复。

### 3.1 知识点清单

| 知识点 | 干什么 | 状态 |
|--------|--------|------|
| `SET` / `SET +=` | 修改/新增属性 | ✅ |
| `REMOVE` / `SET prop = NULL` | 删除属性 | ✅ |
| `SET :标签` / `REMOVE :标签` | 加/减标签 | ✅ |
| `DELETE` vs `DETACH DELETE` | 删节点(连关系一起删) | ✅ |
| `MERGE` + `ON CREATE SET` / `ON MATCH SET` | 幂等写入 | ✅ |
| 关系也能 SET 属性 | `SET r.rank = '大徒弟'` | ✅ |
| 关系方向设计 | 方向 = 最常用查询方向 | ✅ |
| 属性 vs 关系 | 不产生联系的做属性 | ✅ |
| 反范式取舍 | 冗余换性能,代价是一致性 | ✅ |

### 3.2 示例查询(直接跑)

```cypher
-- 1) SET 单个属性
MATCH (p:Person {name:'孙悟空'}) SET p.weapon = '金箍棒' RETURN p.name, p.weapon;

-- 2) SET += 合并 map
MATCH (p:Person {name:'沙悟净'}) SET p += {weapon: '降妖宝杖', origin: '流沙河'} RETURN p.name, p.weapon, p.origin;

-- 3) REMOVE / SET NULL(等价)
MATCH (p:Person {name:'沙悟净'}) REMOVE p.origin;
MATCH (p:Person {name:'沙悟净'}) SET p.origin = NULL;

-- 4) 加标签
MATCH (p:Person {name:'镇元子'}) SET p:Immortal RETURN labels(p) AS 标签;

-- 5) DELETE 有关系节点会报错
MATCH (p:Person {name:'红孩儿'}) DELETE p;  -- ❌ 报错
MATCH (p:Person {name:'红孩儿'}) DETACH DELETE p;  -- ✅ 连关系一起删

-- 6) MERGE + ON CREATE/ON MATCH
MERGE (p:Person {id:'erlang_shen', name:'杨戬'})
ON CREATE SET p.created = true, p.role = '天庭'
ON MATCH SET p.matched = true
RETURN p;
-- 第一次:created=true;第二次:matched=true(幂等)

-- 7) 关系 SET 属性
MATCH (t:Person {name:'唐僧'})-[r:师徒]->(s:Person {name:'孙悟空'})
SET r.rank = '大徒弟'
RETURN t.name, type(r) AS 关系, r.rank AS 排行, s.name;

-- 8) 方向思考:师徒是 唐僧->徒弟
MATCH (m)-[:师徒]->(t) WHERE m.name='唐僧' RETURN t.name;  -- 查徒弟
MATCH (m)<-[:师徒]-(t) WHERE m.name='唐僧' RETURN t.name;  -- 查师傅(空)
MATCH (m:Person) WHERE NOT (m)<-[:师徒]-() RETURN m.name;  -- 查没有师傅的人(唐僧)
```

### 3.3 建模三原则(必考)

| 问题 | 决策依据 | 结论 |
|------|---------|------|
| **关系方向** | 选最常用查询方向;双向常查用无向查询 | `师徒` 建 `唐僧->徒弟`,查徒弟快 |
| **属性 vs 节点** | 不产生联系的做属性;需要独立查询/有自己属性/多节点关联时升级为节点 | 金箍棒→属性;金箍棒曾被多人拿过→节点 |
| **范式 vs 反范式** | 读远多于写、性能瓶颈时反范式;代价是数据一致性要维护 | role 冗余到关系上→查询快,改 role 要改多处 |

### 3.4 易错点(本次练习踩过的坑)

1. **别名不能用字符串模板**:Cypher 的 AS 列名是静态标识符,不支持 `${p.name}标签列表` 这种动态插值,动态内容放值里
2. **DETACH DELETE 后 RETURN 节点为空**:节点已删,应该 `RETURN count(p)` 或 `RETURN p` 放在 DELETE 前面
3. **CREATE 重复执行会重复创建**:CREATE 无脑新建,要幂等用 MERGE + 唯一约束
4. **方向反了查不到**:数据方向是 `唐僧->徒弟`,反方向 `<-[:师徒]-` 查的是"谁是唐僧的师傅",空结果是正确的
5. **RETURN 关系对象 Table 视图隐藏属性**:Browser 默认只显示关系类型名,显式写 `r.rank` 或点 Raw 标签看完整属性

### 3.5 数据恢复

```bash
node import.js
```

---

## 第 4 阶段:索引与性能(项目变大后必学) ⏳

> 本阶段全部只读查询,不修改数据,跑完后直接恢复(或不用恢复)。

### 4.1 知识点清单

| 知识点 | 干什么 | 状态 |
|--------|--------|------|
| 唯一约束 | 防重复 + 自动索引 | ⏳ |
| 普通索引 | 加速按属性查找 | ⏳ |
| `EXPLAIN` | 看查询计划不执行 | ⏳ |
| `PROFILE` | 执行 + 看 DB hits | ⏳ |
| DB hits | 衡量查询工作量 | ⏳ |
| 查询优化思路 | 避免笛卡尔积、用参数化、加 LIMIT | ⏳ |

### 4.2 为什么需要索引?

现在我们只有 15 个节点,查询瞬间完成。但如果有 100 万个节点,每次 `MATCH (p:Person {name:'孙悟空'})` 都要**全表扫描**(遍历 100 万个节点找 name='孙悟空'),会很慢。

索引就是给常用查询字段**建一本书的目录**,让 Neo4j 直接定位而不是挨个翻。

### 4.3 示例查询(直接跑)

```cypher
-- ===== 先看没索引时的查询成本 =====

-- PROFILE 会执行查询并返回每个步骤的 DB hits
PROFILE MATCH (p:Person {name:'孙悟空'}) RETURN p;
-- 注意看左侧"Number of db hits"数值,记下来(大概 15 次)

-- ===== 建索引 =====

-- 唯一约束(自动建索引,推荐优先用):id 全局唯一
CREATE CONSTRAINT person_id_unique IF NOT EXISTS
FOR (p:Person) REQUIRE p.id IS UNIQUE;

-- 普通索引:按 name 查找加速
CREATE INDEX person_name IF NOT EXISTS
FOR (p:Person) ON (p.name);

-- ===== 再看有索引时的查询成本 =====
PROFILE MATCH (p:Person {name:'孙悟空'}) RETURN p;
-- DB hits 应该大幅下降(从 15 降到 1~2)

-- ===== EXPLAIN 只看计划不执行 =====
EXPLAIN MATCH (p:Person {name:'孙悟空'}) RETURN p;
-- 会显示查询计划树,但不实际执行(适合大查询,怕跑太慢先看计划)

-- ===== 查看现有索引 =====
SHOW INDEXES;
-- 或
CALL db.indexes();

-- ===== 删除索引 =====
DROP INDEX person_name IF EXISTS;
DROP CONSTRAINT person_id_unique IF EXISTS;
```

### 4.4 PROFILE 输出怎么看?

PROFILE 的输出是一棵**执行计划树**,关键看：

| 指标 | 含义 | 越少越好 |
|------|------|---------|
| **DB hits** | 访问磁盘的次数(类似 SQL 的 logical reads) | ✅ |
| **Rows** | 该步骤处理了多少行 | ✅ |
| **Page Cache Hit Ratio** | 缓存命中率,1.0 表示全在内存 | 越高越好 |

典型对比:

```
无索引:NodeByLabelScan → 扫 15 个 Person → DB hits ≈ 15
有索引:NodeIndexSeek  → 直接定位孙悟空   → DB hits ≈ 2
```

### 4.5 查询优化三条铁律

| 规则 | 说明 | 示例 |
|------|------|------|
| **先过滤再遍历** | WHERE 尽量写在 MATCH 里,减少后续遍历量 | `MATCH (p:Person {name:'孙悟空'})` 比 `MATCH (p:Person) WHERE p.name='孙悟空'` 好 |
| **加 LIMIT** | 图遍历可能返回海量路径,先 LIMIT 看结果 | `MATCH p=()-[*1..5]->() RETURN p LIMIT 20` |
| **用参数化** | 避免每次查询都重新编译计划 | `session.run('MATCH (p:Person {name: $name})', { name })` |

### 4.6 练习题

**练习 1:** 用 PROFILE 对比 `MATCH (p:Person {id:'tang_seng'}) RETURN p` 在"有 id 唯一约束"前后的 DB hits 变化。

**练习 2:** 给 `role` 属性建索引,用 PROFILE 对比 `MATCH (p:Person {role:'主角'}) RETURN p` 前后的 DB hits。

**练习 3:** 用 EXPLAIN 分析 `MATCH p=shortestPath((a)-[*..5]-(b)) RETURN p` 的查询计划(不执行,只看计划)。

**练习 4(思考题):** 为什么给 `name` 建了索引但 `MATCH (p:Person) WHERE p.name CONTAINS '悟空'` 还是走全表扫描?提示:CONTAINS / =~ 正则 / 模糊匹配都用不上普通 RANGE 索引。

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

### 第 2 阶段完成日期:2026-09-18

练习过的查询类型:固定深度、变长路径 `*1..N`、任意深度 `*`、shortestPath、allShortestPaths、关系类型过滤、无向遍历、路径信息提取(length/nodes/列表推导)。

踩过的坑:见上方 [2.5 易错点](#25-易错点本次练习踩过的坑)。

核心收获:
- 图遍历关键是**路径变量 `p`**,`MATCH p=()` 把整条链路返回,Graph 视图才能画线
- **方向问题是图遍历头号陷阱**:数据方向 ↔ 查询方向,shortestPath 统一用无向
- Neo4j 图遍历性能远超传统 JOIN,但 `[*]` 任意深度要慎用

### 第 3 阶段完成日期:2026-09-21

练习过的查询类型:SET/SET +=、REMOVE、多标签、DELETE vs DETACH DELETE、MERGE + ON CREATE/ON MATCH、关系 SET 属性、方向设计、建模三原则(方向/属性vs节点/范式vs反范式)。

踩过的坑:见上方 [3.4 易错点](#34-易错点本次练习踩过的坑)。

核心收获:
- **写入和查询同等重要** — SET/REMOVE 是日常维护,不是一次性导入
- **建模决策影响查询效率** — 方向、属性vs节点、范式vs反范式三个问题要在设计阶段想清楚
- **MERGE 是生产级写入首选** — CREATE 重复会乱,MERGE 保证幂等,加唯一约束更稳
- **Browser 的 Table 视图会"简化显示"** — 关系对象默认只显示类型名,属性要显式返回或看 Raw 标签
