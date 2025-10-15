# Knowledge Base System - Complete Workflow

## Overview

The knowledge base system in Asimov follows a three-phase pipeline: **Load → Index → Retrieve**. This document provides a comprehensive overview of how knowledge bases are created, trained (indexed), and queried.

---

## Architecture Components

### Core Modules

- **`knowledge/load/`** - Data ingestion from various sources
- **`knowledge/index/`** - Text chunking and embedding generation
- **`knowledge/retrieve/`** - Similarity search and retrieval
- **`knowledge/datastores/`** - Vector database clients (Qdrant, Weaviate)

### Vector Databases

- **Weaviate** - Primary vector store with hybrid search capabilities
- **Qdrant** - Secondary vector store with multi-tenancy support

---

## Complete Workflow Diagram

```mermaid
graph TB
    subgraph "Phase 1: LOAD"
        A[Client Request] -->|POST /api/data-resources| B[Load Router]
        B --> C[Create Data Resource]
        C --> D[Celery Task: task_run_loader]
        D --> E{Loader Type}
        
        E -->|web_base_loader| F1[Scrapy Spider]
        E -->|pdf_loader| F2[PDF Processor]
        E -->|slack_loader| F3[Slack API]
        E -->|notion_loader| F4[Notion API]
        E -->|confluence_loader| F5[Confluence API]
        E -->|zendesk_loader| F6[Zendesk API]
        E -->|sharepoint_loader| F7[SharePoint API]
        
        F1 & F2 & F3 & F4 & F5 & F6 & F7 --> G[Extract Content]
        G --> H[Write to CSV]
        H --> I[Upload to S3]
        I --> J[Update Dashboard]
        J --> K[Store Task ID in Redis]
    end
    
    subgraph "Phase 2: INDEX"
        L[Client Request] -->|POST /api/embeddings| M[Index Router]
        M --> N[Validate Data Exists]
        N --> O[Celery Task: task_create_embeddings]
        O --> P[Read CSV from S3]
        P --> Q[Filter Selected URLs]
        Q --> R[Text Splitting]
        R --> S{Batch Processing}
        
        S --> T1[Generate OpenAI Embeddings]
        T1 --> U1[Upload to Qdrant]
        T1 --> U2[Upload to Weaviate]
        
        U1 --> V{Success?}
        U2 --> V
        
        V -->|Yes| W[Store Embeddings Task ID]
        V -->|No| X[Cleanup & Rollback]
        X --> Y[Delete Partial Data]
    end
    
    subgraph "Phase 3: RETRIEVE"
        Z[Client Request] -->|POST /api/v2/retrieve| AA[Retrieve Router]
        AA --> AB[Get Knowledge Base IDs]
        AB --> AC[Fetch Data Resource IDs]
        AC --> AD[Determine Vector Store]
        
        AD --> AE{Vector Store}
        
        AE -->|Qdrant| AF1[Query Qdrant]
        AE -->|Weaviate| AF2[Query Weaviate]
        
        AF1 --> AG[Generate Query Embedding]
        AF2 --> AG
        
        AG --> AH[Vector Similarity Search]
        AH --> AI[Get Top N Results]
        AI --> AJ[Cohere Reranking]
        AJ --> AK[Return Top K Results]
    end
    
    K -.->|Status Check| M
    W -.->|Ready for Search| Z
```

---

## Phase 1: Load (Data Ingestion)

### Workflow

1. **API Request**: Client sends `POST /api/data-resources` with loader type and options
2. **Task Creation**: Celery async task `task_run_loader` is created
3. **Data Extraction**: Loader extracts content from source
4. **Storage**: Raw and cleaned data saved to CSV files
5. **S3 Upload**: CSV files uploaded to S3 bucket
6. **Tracking**: Task ID stored in Redis for status monitoring

### Load Phase Sequence Diagram

```mermaid
sequenceDiagram
    participant Client
    participant LoadRouter
    participant CeleryWorker
    participant Loader
    participant S3
    participant Redis
    participant Dashboard

    Client->>LoadRouter: POST /api/data-resources
    LoadRouter->>CeleryWorker: task_run_loader.delay()
    LoadRouter->>Redis: Store task_id
    LoadRouter-->>Client: Return data_resource_id
    
    CeleryWorker->>Loader: Execute loader
    Loader->>Loader: Extract content
    Loader->>Loader: Write to CSV
    Loader->>S3: Upload CSV files
    Loader->>Dashboard: Update status
    Loader-->>CeleryWorker: Return stats
```

### Supported Loaders

| Loader Type | Source | Description |
|------------|--------|-------------|
| `web_base_loader` | Websites | Scrapy-based web scraper (Playwright/Sitemap support) |
| `pdf_loader` | PDF Files | Extract text from PDF documents |
| `slack_loader` | Slack | Import Slack messages and threads |
| `notion_loader` | Notion | Import Notion pages and databases |
| `confluence_loader` | Confluence | Import Confluence spaces and pages |
| `zendesk_loader` | Zendesk | Import support articles |
| `sharepoint_loader` | SharePoint | Import SharePoint documents |
| `text_loader` | Text Files | Plain text file import |
| `qna_tuple_loader` | Q&A Pairs | Question-answer pair import |
| `intent_loader` | Intent Data | Intent classification data |
| `csv_to_sql_loader` | CSV | CSV to SQL conversion |
| `openapi_yaml_loader` | OpenAPI | API documentation import |

### Data Structure (CSV Export)

```csv
content,source,metadata
"Document content here...",https://example.com/page1,"{\"title\":\"Page Title\"}"
"More content...",https://example.com/page2,"{\"author\":\"John Doe\"}"
```

---

## Phase 2: Index (Embedding Generation)

### Workflow

1. **API Request**: Client sends `POST /api/embeddings` with data_resource_id
2. **Data Validation**: Check if data resource exists and not already embedded
3. **CSV Reading**: Read exported CSV from S3
4. **URL Filtering**: Filter to selected URLs (if specified)
5. **Text Chunking**: Split documents into chunks (1000 chars, 50 overlap)
6. **Batch Embedding**: Generate OpenAI embeddings in batches (500 chunks)
7. **Upload to Vector DBs**: Store in both Qdrant and Weaviate
8. **Error Handling**: Rollback on failure to maintain consistency

### Index Phase Detailed Flow

```mermaid
graph LR
    subgraph "Text Processing"
        A[Read CSV from S3] --> B[Filter Selected URLs]
        B --> C[RecursiveCharacterTextSplitter]
        C --> D[Chunks: 1000 chars, 50 overlap]
    end
    
    subgraph "Embedding Generation"
        D --> E[Batch: 500 chunks]
        E --> F[OpenAI API: text-embedding-3-small]
        F --> G[Vector: 1536 dimensions]
    end
    
    subgraph "Storage - Qdrant"
        G --> H1[Create PointStruct]
        H1 --> I1[Add Payload: tenant, data_resource_id, index_type]
        I1 --> J1[Upsert to Collection]
        J1 --> K1{Upload Success?}
        K1 -->|No| L1[Delete All Points]
    end
    
    subgraph "Storage - Weaviate"
        G --> H2[Create Weaviate Object]
        H2 --> I2[Add Properties: content, source, metadata]
        I2 --> J2[Create/Get Tenant]
        J2 --> K2[Batch Insert with Vectors]
        K2 --> L2{Insert Success?}
        L2 -->|No| M2[Delete All Objects]
    end
    
    K1 & L2 -->|Yes| N[Embedding Complete]
    L1 & M2 --> O[Task Failed]
```

### Embedding Process Sequence

```mermaid
sequenceDiagram
    participant Client
    participant IndexRouter
    participant CeleryWorker
    participant S3
    participant OpenAI
    participant Qdrant
    participant Weaviate
    participant Redis

    Client->>IndexRouter: POST /api/embeddings
    IndexRouter->>CeleryWorker: task_create_embeddings.delay()
    IndexRouter->>Redis: Store embeddings task_id
    IndexRouter-->>Client: Return data_resource_id
    
    CeleryWorker->>S3: Read clean_data.csv
    S3-->>CeleryWorker: CSV data
    
    CeleryWorker->>CeleryWorker: Filter URLs & Chunk Text
    
    loop For each batch (500 chunks)
        CeleryWorker->>OpenAI: Generate embeddings
        OpenAI-->>CeleryWorker: Vectors (1536-dim)
        
        par Upload to Vector DBs
            CeleryWorker->>Qdrant: Upload points
            Qdrant-->>CeleryWorker: Success
        and
            CeleryWorker->>Weaviate: Batch insert
            Weaviate-->>CeleryWorker: Success
        end
    end
    
    alt Upload Failed
        CeleryWorker->>Qdrant: Delete data_resource_id
        CeleryWorker->>Weaviate: Delete data_resource_id
        CeleryWorker-->>Client: Task Failed
    else Upload Success
        CeleryWorker-->>Client: Task Success
    end
```

### Vector Database Schemas

#### Qdrant Point Structure

```json
{
  "id": "uuid-v4",
  "vector": [0.123, 0.456, ...],  // 1536 dimensions
  "payload": {
    "tenant": "account_id",
    "data_resource_id": "uuid",
    "index_type": "Paragraph",
    "content": "Chunk text content...",
    "source": "https://example.com/page",
    "metadata": {"key": "value"}
  }
}
```

#### Weaviate Object Structure

```json
{
  "class": "Paragraph",
  "properties": {
    "content": "Chunk text content...",
    "source": "https://example.com/page",
    "data_resource_id": "uuid",
    "metadata": {"key": "value"}
  },
  "vector": [0.123, 0.456, ...],  // 1536 dimensions
  "tenant": "account_id"
}
```

### Index Types

| Index Type | Use Case | Schema |
|-----------|----------|--------|
| `Paragraph` | General chunked text | Default 1000 char chunks |
| `Section` | Document sections | Section-level granularity |
| `Website` | Web page level | Full page content |

### Retry & Error Handling

- **Embedding Generation**: 3 retries with exponential backoff (2x, 3-60s)
- **Qdrant Upload**: 5 retries with exponential backoff (1x, 1-10s)
- **Cleanup on Failure**: All-or-nothing semantics - deletes all data on failure

---

## Phase 3: Retrieve (Similarity Search)

### Workflow

1. **API Request**: Client sends `POST /api/v2/retrieve` with query and kbids
2. **KB Resolution**: Fetch data_resource_ids from knowledge base IDs
3. **Vector Store Selection**: Determine which vector DB to use (per tenant)
4. **Query Embedding**: Generate embedding for query text
5. **Vector Search**: Perform similarity search (top_n results, default 15-20)
6. **Reranking**: Use Cohere to rerank results by relevance
7. **Return Results**: Return top_k results (default 4)

### Retrieve Phase Flow

```mermaid
graph TB
    A[Client Query] --> B[Get KB IDs]
    B --> C[Resolve to data_resource_ids]
    C --> D[Get Vector Store Config]
    
    D --> E{Vector Store Type}
    
    subgraph "Qdrant Path"
        E -->|qdrant| F1[Generate Query Embedding]
        F1 --> G1[Build Filter: tenant, data_resource_ids, index_type]
        G1 --> H1[Query Points with Vector]
        H1 --> I1[Get Top N: 15-20 results]
    end
    
    subgraph "Weaviate Path"
        E -->|weaviate| F2[Generate Query Embedding]
        F2 --> G2[Build Filter: data_resource_ids]
        G2 --> H2[Similarity Search]
        H2 --> I2[Hybrid Search: alpha=0.75]
        I2 --> J2[Get Top N: 15-20 results]
    end
    
    I1 & J2 --> K[Combine Results]
    K --> L[Extract Contexts]
    L --> M[Cohere Reranking]
    M --> N[Return Top K: 4 results]
```

### Retrieve Sequence Diagram

```mermaid
sequenceDiagram
    participant Client
    participant RetrieveRouter
    participant Dashboard
    participant OpenAI
    participant VectorDB
    participant Cohere

    Client->>RetrieveRouter: POST /api/v2/retrieve
    RetrieveRouter->>Dashboard: Get data_resource_ids for kbids
    Dashboard-->>RetrieveRouter: List of data_resource_ids
    
    RetrieveRouter->>Dashboard: Get vector_store config
    Dashboard-->>RetrieveRouter: Vector store type
    
    RetrieveRouter->>OpenAI: Generate query embedding
    OpenAI-->>RetrieveRouter: Query vector (1536-dim)
    
    alt Qdrant
        RetrieveRouter->>VectorDB: Query with filters
        VectorDB-->>RetrieveRouter: Top 15-20 results
    else Weaviate
        RetrieveRouter->>VectorDB: Hybrid search
        VectorDB-->>RetrieveRouter: Top 15-20 results
    end
    
    RetrieveRouter->>Cohere: Rerank results
    Cohere-->>RetrieveRouter: Reranked scores
    
    RetrieveRouter->>RetrieveRouter: Select top 4
    RetrieveRouter-->>Client: Return documents
```

### Search Filters

#### Qdrant Filter Structure

```python
Filter(
    must=[
        FieldCondition(key="tenant", match=MatchValue(value="account_id")),
        FieldCondition(key="index_type", match=MatchAny(any=["Paragraph"])),
        FieldCondition(key="data_resource_id", match=MatchAny(any=["uuid1", "uuid2"]))
    ]
)
```

#### Weaviate Filter Structure

```python
{
    "operator": "And",
    "operands": [
        {
            "path": ["data_resource_id"],
            "operator": "ContainsAny",
            "valueTextArray": ["uuid1", "uuid2"]
        }
    ]
}
```

### Hybrid Search

Weaviate supports hybrid search combining:
- **Vector Search**: Semantic similarity
- **Keyword Search**: BM25 full-text search
- **Alpha Parameter**: Balance between vector (1.0) and keyword (0.0)
  - Default: `alpha=0.75` (75% vector, 25% keyword)

### Reranking Strategy

1. **Initial Retrieval**: Get top 15-20 documents
2. **Context Extraction**: Extract page_content from documents
3. **Cohere Reranking**: Rerank by query relevance
4. **Top K Selection**: Return top 4 most relevant

---

## Data Flow Summary

```mermaid
graph LR
    subgraph "Storage Layer"
        S1[(Redis)]
        S2[(S3)]
        S3[(Qdrant)]
        S4[(Weaviate)]
        S5[(Dashboard DB)]
    end
    
    subgraph "Processing Layer"
        P1[Celery Workers]
        P2[OpenAI API]
        P3[Cohere API]
    end
    
    subgraph "API Layer"
        A1[Load Router]
        A2[Index Router]
        A3[Retrieve Router]
    end
    
    A1 --> P1
    P1 --> S2
    P1 --> S5
    
    A2 --> P1
    P1 --> P2
    P2 --> S3
    P2 --> S4
    
    A3 --> P2
    P2 --> S3
    P2 --> S4
    S3 --> P3
    S4 --> P3
    
    S1 -.->|Task Tracking| P1
```

---

## API Endpoints

### Load APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/data-resources` | POST | Create data resource |
| `/api/data-resources/{id}/status` | GET | Check loading status |
| `/api/data-resources/{id}/logs` | GET | Get loader logs |
| `/api/data-resources` | DELETE | Delete data resource |

### Index APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/embeddings` | POST | Create embeddings |
| `/api/embeddings/{id}/status` | GET | Check embedding status |

### Retrieve APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/retrieve` | POST | Search knowledge base |

---

## Request/Response Examples

### 1. Create Data Resource (Load)

**Request:**
```json
POST /api/data-resources
{
  "data_resource_id": "optional-uuid",
  "account_id": "tenant-123",
  "loader": "web_base_loader",
  "loader_options": {
    "url": "https://example.com",
    "closespider_pagecount": 100,
    "use_browser": false
  }
}
```

**Response:**
```json
{
  "data_resource_id": "uuid-generated"
}
```

### 2. Create Embeddings (Index)

**Request:**
```json
POST /api/embeddings
{
  "data_resource_id": "uuid",
  "account_id": "tenant-123",
  "selected_urls": [
    {"url": "https://example.com/page1"},
    {"url": "https://example.com/page2"}
  ],
  "selected_file_urls": [],
  "vector_store": "weaviate"
}
```

**Response:**
```json
{
  "data_resource_id": "uuid"
}
```

### 3. Retrieve Documents (Search)

**Request:**
```json
POST /api/v2/retrieve
{
  "kbids": ["kb-uuid-1", "kb-uuid-2"],
  "account_id": "tenant-123",
  "query": "How do I configure authentication?",
  "top_k": 4,
  "top_n": 15,
  "alpha": 0.75,
  "hybrid_search": true
}
```

**Response:**
```json
[
  {
    "id": "result-uuid-1",
    "page_content": "To configure authentication...",
    "metadata": {
      "source": "https://example.com/auth-guide",
      "data_resource_id": "uuid"
    }
  },
  {
    "id": "result-uuid-2",
    "page_content": "Authentication setup requires...",
    "metadata": {
      "source": "https://example.com/setup",
      "data_resource_id": "uuid"
    }
  }
]
```

---

## Status Tracking

### Task States

| State | Description |
|-------|-------------|
| `PENDING` | Task queued but not started |
| `RUNNING` | Task is executing |
| `SUCCESS` | Task completed successfully |
| `FAILURE` | Task failed with error |
| `NOT_FOUND` | Task ID not found in Redis |

### Redis Keys

- `data_resource:{uuid}` → Load task ID (TTL: 24h)
- `embeddings:{uuid}` → Embedding task ID (TTL: 24h)
- `visited:{uuid}` → List of successfully crawled URLs
- `failed:{uuid}` → List of failed URLs
- `files:{uuid}` → List of processed files

---

## Multi-Tenancy

### Tenant Isolation

**Qdrant:**
- Uses payload-based filtering with `tenant` field
- Tenant field is indexed for fast filtering
- All queries filtered by tenant ID

**Weaviate:**
- Native multi-tenancy support
- Each tenant has isolated data partition
- Tenants created per collection on first use

### Tenant Configuration

```python
# Weaviate tenant creation
collection.tenants.create(tenants=[Tenant(name=account_id)])

# Qdrant tenant filtering
Filter(must=[
    FieldCondition(key="tenant", match=MatchValue(value=account_id))
])
```

---

## Performance Optimizations

### Batching

- **Embedding Generation**: 500 documents per batch
- **Qdrant Upload**: 500 points per batch
- **Weaviate Upload**: Batch insert with rate limiting

### Retry Logic

- **Transient Failures**: Exponential backoff
- **Rate Limits**: Automatic retry with backoff
- **Timeout Errors**: Configurable retry attempts

### Streaming Pipeline

The indexing process uses a streaming approach:
1. Read batch from S3
2. Generate embeddings
3. Upload to vector DBs
4. Repeat for next batch

This prevents memory overflow for large datasets.

---

## Error Handling & Rollback

### Consistency Guarantees

**All-or-Nothing Semantics:**
- If any batch fails during indexing, all previously uploaded data is deleted
- Ensures no partial/corrupted data in vector stores

### Cleanup Process

```python
try:
    # Upload batches
    embed_documents_in_qdrant(...)
except Exception:
    # Rollback
    qdrant_client.delete(data_resource_id=data_resource_id)
    weaviate_client.delete_data(data_resource_ids=[data_resource_id])
    raise
```

---

## Monitoring & Logging

### Logging Levels

- **DEBUG**: Detailed batch processing info
- **INFO**: High-level operation status
- **ERROR**: Failures and exceptions
- **EXCEPTION**: Full stack traces

### Log Storage

- Logs stored in: `storage/logs/{data_resource_id}.log`
- Accessible via: `GET /api/data-resources/{id}/logs`

---

## Configuration

### Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Qdrant
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-api-key

# Weaviate
WEAVIATE_URL=https://your-cluster.weaviate.network
WEAVIATE_API_KEY=your-api-key

# AWS S3
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_BUCKET_NAME=your-bucket

# Cohere
COHERE_API_KEY=your-key

# Dashboard
DASHBOARD_URL=https://dashboard.example.com
```

### Celery Configuration

```python
# Task time limits
soft_time_limit=30  # minutes
time_limit=30       # minutes

# Redis broker
broker_url="redis://localhost:6379/0"
```

---

## Complete System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        C1[Web Client]
        C2[API Client]
    end
    
    subgraph "API Gateway"
        G[FastAPI Application]
    end
    
    subgraph "Business Logic"
        R1[Load Router & Service]
        R2[Index Router & Service]
        R3[Retrieve Router & Service]
    end
    
    subgraph "Async Processing"
        Q[Celery Workers]
    end
    
    subgraph "External Services"
        E1[OpenAI API]
        E2[Cohere API]
        E3[Source Systems: Web/Slack/Notion/etc]
    end
    
    subgraph "Data Storage"
        D1[(Redis: Task Queue)]
        D2[(S3: CSV Files)]
        D3[(Qdrant: Vectors)]
        D4[(Weaviate: Vectors)]
        D5[(Dashboard DB)]
    end
    
    C1 & C2 --> G
    G --> R1 & R2 & R3
    
    R1 --> Q
    R2 --> Q
    R3 --> E1 & E2
    
    Q --> E1 & E3
    Q --> D1 & D2 & D3 & D4 & D5
    
    R3 --> D3 & D4
    
    style D3 fill:#e1f5ff
    style D4 fill:#e1f5ff
    style E1 fill:#fff3e0
    style E2 fill:#fff3e0
```

---

## Key Takeaways

### Data Pipeline
1. **Load** → Extract content from sources → Store in S3
2. **Index** → Chunk text → Generate embeddings → Store in vector DBs
3. **Retrieve** → Query embedding → Vector search → Rerank → Return results

### Multi-Vector Store Strategy
- **Qdrant**: Fast, efficient, good for high-throughput
- **Weaviate**: Hybrid search, native multi-tenancy
- System supports both with tenant-level configuration

### Scalability Features
- Async processing with Celery
- Batch processing for embeddings
- Streaming pipeline for large datasets
- Multi-tenant isolation

### Reliability Features
- Retry logic with exponential backoff
- All-or-nothing consistency
- Comprehensive error handling
- Status tracking via Redis

---

## Future Enhancements

Potential improvements to consider:

1. **Caching Layer**: Cache frequently accessed embeddings
2. **Incremental Updates**: Update only changed documents
3. **Advanced Chunking**: Context-aware splitting strategies
4. **Multi-Model Support**: Support for different embedding models
5. **Real-time Indexing**: Webhook-based instant indexing
6. **Query Analytics**: Track and optimize common queries
7. **A/B Testing**: Compare different retrieval strategies

---

*Last Updated: 2025-10-15*
