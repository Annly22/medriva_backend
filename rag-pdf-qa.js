//rag_pdf-qa.js
//rag logic code


import { Ollama, OllamaEmbeddings } from "@langchain/ollama";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import path from "node:path";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";

export class PdfQA {
  constructor({
  model,
  pdfDocuments,
  chunkSize,
  chunkOverlap,
  searchType = "similarity",
  kDocuments,
}) {
  this.model = model;
  this.pdfDocuments = Array.isArray(pdfDocuments)
    ? pdfDocuments
    : [pdfDocuments];   // 🔥 Important
  this.chunkSize = chunkSize;
  this.chunkOverlap = chunkOverlap;
  this.searchType = searchType;
  this.kDocuments = kDocuments;
}

  async init() {
    this.llm = new Ollama({ model: this.model });

    let allDocs = [];

 // ✅ LOAD PDFs + attach metadata
    for (const pdf of this.pdfDocuments) {
      const loader = new PDFLoader(
        path.join(import.meta.dirname, pdf.path)
      );

      const docs = await loader.load();

      const docsWithMeta = docs.map(doc => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          pdfId: pdf.id,
          userId: pdf.role === "admin" ? null : pdf.userId
        }
      }));

      allDocs.push(...docsWithMeta);
    }
    const splitter = new CharacterTextSplitter({
      separator: " ",
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
    });
const texts = await splitter.splitDocuments(allDocs);

    const embeddings = new OllamaEmbeddings({ model: "all-minilm:latest" });

    this.db = await MemoryVectorStore.fromDocuments(texts, embeddings);

    this.retriever = this.db.asRetriever({
      k: this.kDocuments,
      searchType: this.searchType,
    });

     // 🔥 UPDATED GENERIC PROMPT
   const prompt = ChatPromptTemplate.fromTemplate(
`You are Medriva AI.

Patient Vitals:
{vitals}

Medical Documents:
{context}

Instructions:

1. Default behavior:
   - Answer normally using the documents.
   - This includes research papers, policies, and general study queries.

2. If the user asks specifically about prescriptions or medicines:
   - List only the medications mentioned.
   - Do NOT include side effects unless explicitly asked.

3. If the user asks specifically about side effects:
   - Extract and list side effects of the medications.

4. If the user asks about a health issue, symptom, or "why/how" question:
   - Identify medications from the documents.
   - Check if any side effects could explain the condition.
   - Explain clearly if there is a possible connection.

IMPORTANT:
- Do NOT assume anything not present in the documents.
- Do NOT invent symptoms or medications.
- Only use the provided context.

User Question:
{input}`
);

    this.combineDocsChain = await createStuffDocumentsChain({
  llm: this.llm,
  prompt,
});

this.chain = await createRetrievalChain({
  combineDocsChain: this.combineDocsChain,
  retriever: this.retriever,
});

    return this;
  }

  queryChain() {
    return this.chain;
  }
// 🔹 Query method
async query(question, vitalsString = "No vitals available.", userId = null) {

  // 🔥 safety
  if (!this.db || !this.db.memoryVectors) {
    return { answer: "RAG system not initialized properly." };
  }

  // 🔥 Step 1: retrieve docs
  let docs = await this.retriever.getRelevantDocuments(question);
  console.log("Retrieved docs:", docs.length);
console.log("Sample doc:", docs[0]);

console.log("Query userId:", userId);
console.log("Doc userId:", docs[0]?.metadata?.userId);

  // 🔥 Step 2: filter by user
  if (userId !== null) {
    docs = docs.filter(
  d =>
    String(d.metadata.userId) === String(userId) ||
    d.metadata.userId === null
);
  }
  console.log("After filtering:", docs.length);

  if (docs.length === 0) {
    return { answer: "No relevant documents found for this user." };
  }
console.log("Context being sent to LLM:");
console.log(docs.map(d => d.pageContent).slice(0, 2));
  // 🔥 Step 3: call combineDocsChain PROPERLY
  const result = await this.combineDocsChain.invoke({
    input: question,
    context: docs,   // correct key for stuff chain
    vitals: vitalsString,
  });
  console.log("RAW LLM RESULT:", result);

  return {
  answer: typeof result === "string"
    ? result
    : result?.answer || result?.output_text || "No response generated"
};

}
// 🔥 DELETE FUNCTION (correct place)
  removePdf(pdfId) {
    if (!this.db || !this.db.memoryVectors) {
      console.log("Vector DB not initialized");
      return;
    }

    const before = this.db.memoryVectors.length;

    this.db.memoryVectors = this.db.memoryVectors.filter(
      vec => vec.metadata?.pdfId !== pdfId
    );

    const after = this.db.memoryVectors.length;

    console.log(`Removed PDF ${pdfId}: ${before - after} chunks deleted`);

    // ✅ Refresh retriever (VERY IMPORTANT)
    this.retriever = this.db.asRetriever({
      k: this.kDocuments,
      searchType: this.searchType,
    });

    if (this.db.memoryVectors.length === 0) {
      console.log("No documents left in RAG");
    }
  }
}