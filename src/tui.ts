import { Plugin } from "@opencode/plugin/tui"

export default Plugin.define({
  id: "oc-question-timeout",
  setup(ctx) {
    const raw: unknown = ctx.options.seconds
    if (raw !== undefined && (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1))
      throw new Error(`oc-question-timeout: invalid "seconds" option: ${JSON.stringify(raw)}`)

    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const stops = [
      ctx.data.on("form.created", ({ data: { form } }) => {
        if (form.metadata?.kind !== "question") return
        timers.set(
          form.id,
          setTimeout(
            async () => {
              timers.delete(form.id)
              try {
                await ctx.data.session.form.sync(form.sessionID, ctx.location ?? ctx.data.location.default())
                if (
                  !ctx.data.session.form
                    .list(form.sessionID, ctx.location ?? ctx.data.location.default())
                    ?.some((item) => item.id === form.id)
                )
                  return
                if (!form.fields.length) return
                const answer: Record<string, string | string[]> = {}
                for (const field of form.fields) {
                  if (
                    (field.type !== "string" && field.type !== "multiselect") ||
                    !field.options?.length ||
                    (field.type === "multiselect" && (field.minItems ?? 0) > 1)
                  )
                    return
                  const first = field.options[0]
                  if (first === undefined) return
                  answer[field.key] = field.type === "multiselect" ? [first.value] : first.value
                }
                await ctx.data.session.form.reply(
                  { sessionID: form.sessionID, formID: form.id, answer },
                  ctx.location ?? ctx.data.location.default(),
                )
              } catch (error) {
                console.error("[oc-question-timeout]", error)
              }
            },
            (raw === undefined ? 1800 : raw) * 1000,
          ),
        )
      }),
      ctx.data.on("form.replied", ({ data: { id } }) => {
        clearTimeout(timers.get(id))
        timers.delete(id)
      }),
      ctx.data.on("form.cancelled", ({ data: { id } }) => {
        clearTimeout(timers.get(id))
        timers.delete(id)
      }),
    ]

    return () => {
      for (const stop of stops) stop()
      for (const timer of timers.values()) clearTimeout(timer)
    }
  },
})
