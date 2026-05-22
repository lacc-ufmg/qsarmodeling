import { Paper, Text, Timeline, Title } from "@mantine/core";

type WorkflowTimelineProps = {
  history: string[];
};

export function WorkflowTimeline({ history }: WorkflowTimelineProps) {
  if (history.length === 0) {
    return null;
  }

  return (
    <Paper withBorder p="lg" radius="md" shadow="sm">
      <Title order={3} mb="lg">
        Workflow history
      </Title>
      <Timeline active={history.length} bulletSize={24} lineWidth={2}>
        {history.map((item, index) => {
          const [time, ...msgParts] = item.split(" - ");
          const msg = msgParts.join(" - ");
          return (
            <Timeline.Item key={index} title={msg}>
              <Text c="dimmed" size="xs" mt={4}>
                {time}
              </Text>
            </Timeline.Item>
          );
        })}
      </Timeline>
    </Paper>
  );
}
