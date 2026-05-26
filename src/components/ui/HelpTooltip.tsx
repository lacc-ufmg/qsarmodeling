import { ActionIcon, Tooltip } from "@mantine/core";
import { IconQuestionMark } from "@tabler/icons-react";
import { Group } from "@mantine/core";

type HelpTooltipProps = {
  text: string;
};

export function HelpTooltip({ text }: HelpTooltipProps) {
  return (
    <Tooltip label={text} multiline w={250} withArrow>
      <ActionIcon
        variant="light"
        size="xs"
        radius="xl"
        color="gray"
        aria-label="Help"
      >
        <IconQuestionMark size="0.8rem" />
      </ActionIcon>
    </Tooltip>
  );
}

export function TooltipLabel({ label, help }: { label: React.ReactNode|string; help: string }) {
  return (
        <Group gap="xs">
          {label}
          <HelpTooltip text={help} />
        </Group>
  );
}
