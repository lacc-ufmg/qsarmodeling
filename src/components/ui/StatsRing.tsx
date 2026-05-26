import { Center, Group, Paper, RingProgress, Text } from '@mantine/core';

type Stat = {
    label: string;
    stats: string;
    progress: number;
    color: string;
    icon: React.ReactNode;
};

type StatsRingProps = {
    stats: Stat[];
};

export function StatsRing({ stats }: StatsRingProps) {
  const content = stats.map((stat) => {
    return (
      <Paper withBorder radius="md" p="sm" key={stat.label}>
        <Group>
          <RingProgress
            size={80}
            roundCaps
            thickness={8}
            sections={[{ value: stat.progress, color: stat.color }]}
            label={
              <Center>
                {stat.icon}
              </Center>
            }
          />

          <div>
            <Text c="dimmed" size="sm" tt="uppercase" fw={700}>
              {stat.label}
            </Text>
            <Text fw={700} size="xl">
              {stat.stats}
            </Text>
          </div>
        </Group>
      </Paper>
    );
  });

  return <>{content}</>;
}
