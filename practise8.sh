#!/bin/bash
# 第 6 阶段 练习脚本:Neo4j 备份恢复(dump + load)
# 用法:
#   ./practise8.sh backup                      # 备份当前数据库
#   ./practise8.sh restore <dump文件路径>       # 从指定 dump 恢复
#   ./practise8.sh list                        # 列出所有备份
#
# 实战验证流程(走完掌握完整闭环):
#   1. ./practise8.sh backup
#   2. 破坏数据: docker exec neo4j cypher-shell -u neo4j -p your_password "MATCH (n:Person {name:'孙悟空'}) DELETE n"
#   3. ./practise8.sh list
#   4. ./practise8.sh restore ./backup/neo4j-<时间戳>.dump
#   5. 验证: 节点数应该恢复为 15

set -e  # 任何命令失败立即退出

CONTAINER=neo4j
DB_USER=neo4j
DB_PASS=your_password
DB_NAME=neo4j
BACKUP_DIR=./backup
INSIDE_PATH=/data/backup  # 容器内的备份目录(挂载在 /data 卷下,持久化)

mkdir -p "$BACKUP_DIR"

case "$1" in
  backup)
    # ===== 备份流程(社区版:需停服务) =====
    # 社区版不支持 STOP DATABASE(默认库),必须停整个容器才能 dump
    # 1. 停掉运行中的 neo4j 容器(数据保留在挂载的 volume 里)
    echo "📦 [1/4] 停止容器 $CONTAINER ..."
    docker stop "$CONTAINER" >/dev/null
    # 2. 起一个临时容器,复用原容器的 /data 卷(--volumes-from),执行 dump
    #    --rm 表示用完自动删除临时容器
    echo "📦 [2/4] 临时容器内 dump 数据库 $DB_NAME ..."
    docker run --rm --volumes-from "$CONTAINER" neo4j:5 \
      neo4j-admin database dump "$DB_NAME" \
      --to-path="$INSIDE_PATH" --overwrite-destination=true
    # 3. 启动原容器
    echo "📦 [3/4] 启动容器 $CONTAINER ..."
    docker start "$CONTAINER" >/dev/null
    # 4. 把 dump 从容器拷到宿主机,文件名带时间戳
    TS=$(date +%Y%m%d-%H%M%S)
    echo "📦 [4/4] 拷贝到宿主机: $BACKUP_DIR/$DB_NAME-$TS.dump"
    docker cp "$CONTAINER:$INSIDE_PATH/$DB_NAME.dump" "$BACKUP_DIR/$DB_NAME-$TS.dump"
    echo "✅ 备份完成: $BACKUP_DIR/$DB_NAME-$TS.dump"
    ;;

  restore)
    [ -z "$2" ] && { echo "用法: $0 restore <dump文件路径>"; exit 1; }
    DUMP_FILE="$2"
    [ ! -f "$DUMP_FILE" ] && { echo "❌ 文件不存在: $DUMP_FILE"; exit 1; }

    # ===== 恢复流程(社区版:需停服务) =====
    # 1. 先把 dump 拷进容器(data 卷在容器停止后仍可访问)
    echo "♻️  [1/5] 拷贝 dump 到容器 ..."
    docker cp "$DUMP_FILE" "$CONTAINER:$INSIDE_PATH/$DB_NAME.dump"
    # 2. 停容器
    echo "♻️  [2/5] 停止容器 $CONTAINER ..."
    docker stop "$CONTAINER" >/dev/null
    # 3. 临时容器复用 data 卷,执行 load
    echo "♻️  [3/5] 临时容器内 load 数据库 $DB_NAME ..."
    docker run --rm --volumes-from "$CONTAINER" neo4j:5 \
      neo4j-admin database load "$DB_NAME" \
      --from-path="$INSIDE_PATH" --overwrite-destination=true
    # 4. 启动原容器
    echo "♻️  [4/5] 启动容器 $CONTAINER ..."
    docker start "$CONTAINER" >/dev/null
    # 5. 等 Neo4j 就绪后验证
    echo "♻️  [5/5] 等待 Neo4j 就绪并验证 ..."
    for i in $(seq 1 20); do
      if docker exec "$CONTAINER" cypher-shell -u "$DB_USER" -p "$DB_PASS" \
        "MATCH (n) RETURN count(n) AS 节点数" 2>/dev/null; then
        break
      fi
      sleep 2
    done
    ;;

  list)
    echo "📋 已有备份:"
    ls -lh "$BACKUP_DIR"/*.dump 2>/dev/null || echo "  (无)"
    ;;

  *)
    echo "用法: $0 {backup|restore <file>|list}"
    exit 1
    ;;
esac
