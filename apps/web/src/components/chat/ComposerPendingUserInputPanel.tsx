import { type ApprovalRequestId } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useRef } from "react";
import { type PendingUserInput } from "../../session-logic";
import {
  derivePendingUserInputProgress,
  type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import { CheckIcon, FilePenLineIcon } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";

interface PendingUserInputPanelProps {
  pendingUserInputs: PendingUserInput[];
  respondingRequestIds: ApprovalRequestId[];
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onSelectOption: (questionId: string, optionLabel: string) => void;
  onAdvance: () => void;
  onRestorePrefill?: () => void;
}

export const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  pendingUserInputs,
  respondingRequestIds,
  answers,
  questionIndex,
  onSelectOption,
  onAdvance,
  onRestorePrefill,
}: PendingUserInputPanelProps) {
  if (pendingUserInputs.length === 0) return null;
  const activePrompt = pendingUserInputs[0];
  if (!activePrompt) return null;

  return (
    <ComposerPendingUserInputCard
      key={activePrompt.requestId}
      prompt={activePrompt}
      isResponding={respondingRequestIds.includes(activePrompt.requestId)}
      answers={answers}
      questionIndex={questionIndex}
      onSelectOption={onSelectOption}
      onAdvance={onAdvance}
      {...(onRestorePrefill ? { onRestorePrefill } : {})}
    />
  );
});

const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
  prompt,
  isResponding,
  answers,
  questionIndex,
  onSelectOption,
  onAdvance,
  onRestorePrefill,
}: {
  prompt: PendingUserInput;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onSelectOption: (questionId: string, optionLabel: string) => void;
  onAdvance: () => void;
  onRestorePrefill?: () => void;
}) {
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;
  const autoAdvanceTimerRef = useRef<number | null>(null);

  // Clear auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, []);

  const selectOptionAndAutoAdvance = useCallback(
    (questionId: string, optionLabel: string) => {
      onSelectOption(questionId, optionLabel);
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        onAdvance();
      }, 200);
    },
    [onSelectOption, onAdvance],
  );

  // Keyboard shortcut: number keys 1-9 select corresponding option and auto-advance.
  // Works even when the Lexical composer (contenteditable) has focus — the composer
  // doubles as a custom-answer field during user input, and when it's empty the digit
  // keys should pick options instead of typing into the editor.
  useEffect(() => {
    if (
      !activeQuestion ||
      isResponding ||
      prompt.responseKind === "input" ||
      prompt.responseKind === "editor"
    ) {
      return;
    }
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      // If the user has started typing a custom answer in the contenteditable
      // composer, let digit keys pass through so they can type numbers.
      if (target instanceof HTMLElement && target.isContentEditable) {
        const hasCustomText = progress.customAnswer.length > 0;
        if (hasCustomText) return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const optionIndex = digit - 1;
      if (optionIndex >= activeQuestion.options.length) return;
      const option = activeQuestion.options[optionIndex];
      if (!option) return;
      event.preventDefault();
      selectOptionAndAutoAdvance(activeQuestion.id, option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    activeQuestion,
    isResponding,
    prompt.responseKind,
    selectOptionAndAutoAdvance,
    progress.customAnswer.length,
  ]);

  if (!activeQuestion) {
    return null;
  }

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {prompt.questions.length > 1 ? (
            <span className="flex h-5 items-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground/60">
              {questionIndex + 1}/{prompt.questions.length}
            </span>
          ) : null}
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
            {activeQuestion.header}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-foreground/90">{activeQuestion.question}</p>
      {prompt.responseKind === "editor" ? (
        <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 rounded-md bg-blue-500/12 p-1.5 text-blue-400">
                <FilePenLineIcon className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground/90">Inline editor</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground/80">
                  Edit the full response below, then submit it back to the agent.
                </p>
              </div>
            </div>
            {prompt.prefill !== undefined && onRestorePrefill ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={isResponding}
                onClick={onRestorePrefill}
              >
                Restore original
              </Button>
            ) : null}
          </div>
        </div>
      ) : prompt.responseKind === "input" ? (
        <div className="mt-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-xs leading-5 text-muted-foreground/80">
          Type your response below, then submit it back to the agent.
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          {activeQuestion.options.map((option, index) => {
            const isSelected = progress.selectedOptionLabel === option.label;
            const shortcutKey = index < 9 ? index + 1 : null;
            return (
              <button
                key={`${activeQuestion.id}:${option.label}`}
                type="button"
                disabled={isResponding}
                onClick={() => selectOptionAndAutoAdvance(activeQuestion.id, option.label)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all duration-150",
                  isSelected
                    ? "border-blue-500/40 bg-blue-500/8 text-foreground"
                    : "border-transparent bg-muted/20 text-foreground/80 hover:bg-muted/40 hover:border-border/40",
                  isResponding && "opacity-50 cursor-not-allowed",
                )}
              >
                {shortcutKey !== null ? (
                  <kbd
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-medium tabular-nums transition-colors duration-150",
                      isSelected
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-muted/40 text-muted-foreground/50 group-hover:bg-muted/60 group-hover:text-muted-foreground/70",
                    )}
                  >
                    {shortcutKey}
                  </kbd>
                ) : null}
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{option.label}</span>
                  {option.description && option.description !== option.label ? (
                    <span className="ml-2 text-xs text-muted-foreground/50">
                      {option.description}
                    </span>
                  ) : null}
                </div>
                {isSelected ? <CheckIcon className="size-3.5 shrink-0 text-blue-400" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
