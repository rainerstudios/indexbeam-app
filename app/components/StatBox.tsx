import { Card, Text, Box } from "@shopify/polaris";
import { ArrowUpIcon, ArrowDownIcon } from "@shopify/polaris-icons";
import { SparkLineChart } from "@shopify/polaris-viz";
import "@shopify/polaris-viz/build/esm/styles.css";

interface StatBoxProps {
  title: string;
  value: string | number;
  data?: number[];
}

export function StatBox({ title, value, data = [] }: StatBoxProps) {
  const hasData = data && data.length;
  const percentageChange = hasData
    ? getPercentageChange(Number(data[0]), Number(data.at(-1)))
    : null;

  return (
    <Card padding="0">
      <Box paddingBlock="400" paddingInlineStart="400">
        <div
          style={{
            height: 65,
            position: "relative",
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "end",
              minWidth: 30,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -8,
                left: -2,
                zIndex: 20,
              }}
            >
              <Text as="p" variant="headingSm">
                {title}
              </Text>
            </div>
            <Text as="h2" variant="headingLg" fontWeight="bold">
              {String(value)}
            </Text>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: -4,
              }}
            >
              {percentageChange ? (
                percentageChange > 0 ? (
                  <ArrowUpIcon
                    style={{ height: 12, width: 12 } as any}
                    fill="green"
                  />
                ) : (
                  <ArrowDownIcon
                    style={{ height: 12, width: 12 } as any}
                    fill="red"
                  />
                )
              ) : null}
              <Text variant="bodySm" tone="subdued">
                <span
                  style={
                    percentageChange
                      ? {
                          color: percentageChange > 0 ? "green" : "red",
                        }
                      : undefined
                  }
                >
                  {percentageChange ? `${Math.abs(percentageChange)}%` : "-"}
                </span>
              </Text>
            </div>
          </div>
          {hasData ? (
            <div
              style={{ flex: 1, width: "50%", height: "80%", alignSelf: "end" }}
            >
              <SparkLineChart
                offsetLeft={4}
                offsetRight={0}
                data={formatChartData(data)}
              />
            </div>
          ) : null}
        </div>
      </Box>
    </Card>
  );
}

function formatChartData(values: number[] = []) {
  return [{ data: values.map((stat, idx) => ({ key: idx, value: stat })) }];
}

function getPercentageChange(start = 0, end = 0): number | null {
  if (isNaN(start) || isNaN(end) || start === 0) return null;
  const percentage = Math.round(((end - start) / start) * 100);
  if (percentage > 999) return 999;
  if (percentage < -999) return -999;
  return percentage;
}
