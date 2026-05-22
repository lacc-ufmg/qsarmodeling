import { ActionIcon, Tooltip } from "@mantine/core";
import { IconQuestionMark } from "@tabler/icons-react";

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
