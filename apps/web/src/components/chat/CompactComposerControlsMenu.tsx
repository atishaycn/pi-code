import { ProviderInteractionMode, RuntimeMode, type PiQueueMode } from "@t3tools/contracts";
import { memo, type ReactNode } from "react";
import { EllipsisIcon, ListTodoIcon, SparklesIcon } from "lucide-react";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuTrigger,
} from "../ui/menu";

export const CompactComposerControlsMenu = memo(function CompactComposerControlsMenu(props: {
  activePlan: boolean;
  interactionMode: ProviderInteractionMode;
  planSidebarOpen: boolean;
  runtimeMode: RuntimeMode;
  traitsMenuContent?: ReactNode;
  piRuntime?: {
    steeringMode: PiQueueMode;
    followUpMode: PiQueueMode;
    autoCompactionEnabled: boolean;
    sessionStatsLabel?: string;
    compacting?: boolean;
    updating?: boolean;
    onSteeringModeChange: (mode: PiQueueMode) => void;
    onFollowUpModeChange: (mode: PiQueueMode) => void;
    onAutoCompactionChange: (enabled: boolean) => void;
    onCompactNow: () => void;
  };
  onToggleInteractionMode: () => void;
  onTogglePlanSidebar: () => void;
  onToggleRuntimeMode: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80"
            aria-label="More composer controls"
          />
        }
      >
        <EllipsisIcon aria-hidden="true" className="size-4" />
      </MenuTrigger>
      <MenuPopup align="start">
        {props.traitsMenuContent ? (
          <>
            {props.traitsMenuContent}
            <MenuDivider />
          </>
        ) : null}
        <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Mode</div>
        <MenuRadioGroup
          value={props.interactionMode}
          onValueChange={(value) => {
            if (!value || value === props.interactionMode) return;
            props.onToggleInteractionMode();
          }}
        >
          <MenuRadioItem value="default">Chat</MenuRadioItem>
          <MenuRadioItem value="plan">Plan</MenuRadioItem>
        </MenuRadioGroup>
        <MenuDivider />
        <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Access</div>
        <MenuRadioGroup
          value={props.runtimeMode}
          onValueChange={(value) => {
            if (!value || value === props.runtimeMode) return;
            props.onToggleRuntimeMode();
          }}
        >
          <MenuRadioItem value="approval-required">Supervised</MenuRadioItem>
          <MenuRadioItem value="full-access">Full access</MenuRadioItem>
        </MenuRadioGroup>
        {props.piRuntime ? (
          <>
            <MenuDivider />
            <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Pi runtime</div>
            <div className="px-2 pb-1 text-[11px] text-muted-foreground">
              {props.piRuntime.sessionStatsLabel ?? "Session runtime controls"}
            </div>
            <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
              Steering queue
            </div>
            <MenuRadioGroup
              value={props.piRuntime.steeringMode}
              onValueChange={(value) => {
                if (value === "all" || value === "one-at-a-time") {
                  props.piRuntime?.onSteeringModeChange(value);
                }
              }}
            >
              <MenuRadioItem value="one-at-a-time">One at a time</MenuRadioItem>
              <MenuRadioItem value="all">Deliver all</MenuRadioItem>
            </MenuRadioGroup>
            <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
              Follow-up queue
            </div>
            <MenuRadioGroup
              value={props.piRuntime.followUpMode}
              onValueChange={(value) => {
                if (value === "all" || value === "one-at-a-time") {
                  props.piRuntime?.onFollowUpModeChange(value);
                }
              }}
            >
              <MenuRadioItem value="one-at-a-time">One at a time</MenuRadioItem>
              <MenuRadioItem value="all">Deliver all</MenuRadioItem>
            </MenuRadioGroup>
            <MenuDivider />
            <MenuItem
              onClick={() =>
                props.piRuntime?.onAutoCompactionChange(!props.piRuntime?.autoCompactionEnabled)
              }
            >
              <SparklesIcon className="size-4 shrink-0" />
              {props.piRuntime.autoCompactionEnabled
                ? "Disable auto-compaction"
                : "Enable auto-compaction"}
            </MenuItem>
            <MenuItem onClick={props.piRuntime.onCompactNow}>
              <SparklesIcon className="size-4 shrink-0" />
              {props.piRuntime.compacting ? "Compacting…" : "Compact now"}
            </MenuItem>
          </>
        ) : null}
        {props.activePlan ? (
          <>
            <MenuDivider />
            <MenuItem onClick={props.onTogglePlanSidebar}>
              <ListTodoIcon className="size-4 shrink-0" />
              {props.planSidebarOpen ? "Hide plan sidebar" : "Show plan sidebar"}
            </MenuItem>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});
