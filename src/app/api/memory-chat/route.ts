import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getOrCreateUser } from "@/lib/api-utils"
import { complete, LlmError } from "@/lib/ai/llm"
import { getLlmConfigForUser } from "@/lib/ai/user-llm"

const SYSTEM_PROMPT = `You are Mnemo, a decision intelligence assistant. Your role is to answer questions about a workspace using ONLY the provided context.

The context contains structured information from the workspace:
- Decisions - notable choices made, with rationale
- Action Items - tasks someone agreed to do
- Questions - unresolved questions raised

RULES:
1. Answer ONLY using the information provided in the context below.
2. If the context does not contain enough information to answer the question, respond with exactly:
   I don't have enough stored information about that yet.
3. Be concise and direct. 2-4 sentences or a short bullet list.
4. Do NOT include any 'Referenced Decisions', 'Referenced Action Items', or 'Referenced Questions' sections in your answer. Sources are handled separately.
5. Never hallucinate or make up information.

Current context for this workspace:`

interface Decision {
  id: string
  title: string
  summary: string
  status: string
  confidence: number
}

interface ActionItem {
  id: string
  title: string
  description: string
  status: string
  priority: string
}

interface Question {
  id: string
  question: string
  status: string
}

function buildContext(decisions: Decision[], actionItems: ActionItem[], questions: Question[]) {
  const parts: string[] = []

  if (decisions.length > 0) {
    parts.push("=== DECISIONS ===")
    decisions.forEach((d: Decision, i: number) => {
      parts.push(
        `[${i + 1}] Title: ${d.title}
    Summary: ${d.summary}
    Status: ${d.status}
    Confidence: ${d.confidence}`
      )
    })
  }

  if (actionItems.length > 0) {
    parts.push("\n=== ACTION ITEMS ===")
    actionItems.forEach((a: ActionItem, i: number) => {
      parts.push(
        `[${i + 1}] Title: ${a.title}
    Description: ${a.description || "No description"}
    Status: ${a.status}
    Priority: ${a.priority}`
      )
    })
  }

  if (questions.length > 0) {
    parts.push("\n=== QUESTIONS ===")
    questions.forEach((q: Question, i: number) => {
      parts.push(
        `[${i + 1}] Question: ${q.question}
    Status: ${q.status}`
      )
    })
  }

  return parts.join("\n")
}

export async function POST(request: Request) {
  try {
    const user = await getOrCreateUser()

    let body: { workspaceId?: string; message?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const { workspaceId, message } = body

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 })
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 })
    }

    // Verify workspace ownership
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: user.id },
    })
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    }

    // Fetch all decisions, action items, questions for the workspace
    const [decisions, actionItems, questions] = await Promise.all([
      prisma.decision.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
      prisma.actionItem.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
      prisma.question.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    ])

    // Build structured context
    const context = buildContext(decisions, actionItems, questions)

    // If no context exists, return early
    if (!context.trim()) {
      const noContextAnswer = "I don't have enough stored information about that yet. This workspace has no decisions, action items, or questions stored."
      const emptySources = { decisions: [], actionItems: [], questions: [] }

      // Save both messages
      await prisma.chatMessage.createMany({
        data: [
          { workspaceId, userId: user.id, role: "user", content: message },
          { workspaceId, userId: user.id, role: "assistant", content: noContextAnswer, sources: emptySources },
        ],
      })

      return NextResponse.json({
        answer: noContextAnswer,
        sources: emptySources,
        relatedQuestions: [],
      })
    }

    // Answer with the user's own model (Settings → AI Model), else the server default
    let cfg
    try {
      cfg = await getLlmConfigForUser(user.id)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No AI model is connected.", code: "AI_NOT_CONFIGURED" },
        { status: 400 }
      )
    }

    const prompt = `${SYSTEM_PROMPT}

${context}

User Question: ${message}`

    let answer: string
    try {
      answer = (await complete(cfg, { prompt, temperature: 0.1, maxTokens: 2048 })).trim()
    } catch (err) {
      console.error("[memory-chat] model error:", err instanceof Error ? err.message : err)
      if (err instanceof LlmError) {
        const status = err.kind === "busy" ? 503 : err.kind === "bad-response" ? 502 : 400
        return NextResponse.json(
          { error: err.message, code: err.kind === "busy" ? "AI_BUSY" : "AI_ERROR" },
          { status }
        )
      }
      return NextResponse.json({ error: "The AI request failed. Please try again.", code: "AI_ERROR" }, { status: 502 })
    }

    // Generate related follow-up questions
    let relatedQuestions: string[] = []
    try {
      const relatedPrompt = `Based on this question: "${message}"
And this answer: "${answer}"

Generate exactly 3 short follow-up questions a user might want to ask next about their project decisions.

Rules:
- Each question must be under 10 words
- Questions must be directly related to the answer given
- Do not repeat the original question
- Return ONLY a JSON array of 3 strings, nothing else
- Example format: ["Question one?", "Question two?", "Question three?"]`

      const questionsText = (await complete(cfg, { prompt: relatedPrompt, temperature: 0.3, maxTokens: 300 })).trim()
      const start = questionsText.indexOf("[")
      const end = questionsText.lastIndexOf("]")
      const parsed: unknown = JSON.parse(start !== -1 && end > start ? questionsText.slice(start, end + 1) : "[]")
      relatedQuestions = (Array.isArray(parsed) ? parsed : [])
        .filter((q): q is string => typeof q === "string" && q.toLowerCase() !== message.toLowerCase())
        .slice(0, 3)
    } catch {
      relatedQuestions = []
    }

    // Determine which sources were referenced
    const referencedDecisions = decisions.filter((d) =>
      answer.toLowerCase().includes(d.title.toLowerCase())
    )
    const referencedActionItems = actionItems.filter((a) =>
      answer.toLowerCase().includes(a.title.toLowerCase())
    )
    const referencedQuestions = questions.filter((q) =>
      answer.toLowerCase().includes(q.question.toLowerCase())
    )

    // Build sources array
    const sources = {
      decisions: referencedDecisions.map((d) => ({
        id: d.id,
        title: d.title,
        summary: d.summary,
        status: d.status,
      })),
      actionItems: referencedActionItems.map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        priority: a.priority,
      })),
      questions: referencedQuestions.map((q) => ({
        id: q.id,
        question: q.question,
        status: q.status,
      })),
    }

    // Save both messages to database
    await prisma.chatMessage.createMany({
      data: [
        { workspaceId, userId: user.id, role: "user", content: message },
        { workspaceId, userId: user.id, role: "assistant", content: answer, sources },
      ],
    })

    return NextResponse.json({
      answer,
      sources,
      relatedQuestions,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}