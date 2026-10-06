/**
 * The questions the agent asks other agents. `ask_agent` is the tool a session
 * calls to post a question in its DM with another agent and carry on, and what
 * comes back is taken up later as an input of the same session: the other agent's
 * answer, or that it read the question and said nothing, that its turn failed or
 * was stopped, or that it hasn't answered in time. Each open question is kept in
 * the agent's records, with a task that sleeps on the engine's timer until its
 * time is up and then looks at the question's message in chat once before giving
 * up. Closing a question and taking its result up is one commit, which whoever
 * closes it makes in a commit of their own: the task when the time is up, and the
 * agent's side of chat when the other agent's receipt comes, in the commit that
 * moves the agent's place in the feed. Stopping a session's work closes its
 * questions and says nothing more. It must not know how chat is reached or how
 * its feed is read, how a turn's reply is posted, or what a session shows a
 * client.
 */
export { askTools, type AskToolsOptions } from "./ask-agent.durable.ts";
export { type Closed, closeQuestion, forgetPassed } from "./close.durable.ts";
export { closeQuestions, createQuestions, type Questions, type QuestionsOptions } from "./questions.durable.ts";
