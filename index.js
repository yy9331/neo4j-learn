const neo4j = require('neo4j-driver');

// ============ 配置 ============
const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'your_password';

async function main() {
  // 1) 创建 driver 并验证连接
  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  await driver.verifyConnectivity();
  console.log('✅ Neo4j 连接成功');

  const session = driver.session();
  try {
    // 2) 清空数据库:DETACH DELETE 先断开所有关系再删除节点
    const res = await session.run('MATCH (n) DETACH DELETE n');
    const stats = res.summary.counters.updates();
    console.log(`🗑️  数据库已清空:删除节点 ${stats.nodesDeleted} 个,关系 ${stats.relationshipsDeleted} 条`);

    // 3) 探针:确认数据库为空
    const count = await session.run('MATCH (n) RETURN count(n) AS cnt');
    console.log(`📊 当前节点数:${count.records[0].get('cnt').toNumber()}`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('❌ 运行出错:', err.message);
  process.exitCode = 1;
});
