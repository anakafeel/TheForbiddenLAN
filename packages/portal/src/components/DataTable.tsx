import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export interface DataColumn<T> {
  key: string;
  title: string;
  width?: number;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  compact?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, compact = true }: DataTableProps<T>) {
  return (
    <View style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.inner}>
          <View style={styles.headerRow}>
            {columns.map((column) => {
              const headerCellStyle = { ...styles.cell, ...styles.headerCell, width: column.width ?? 160 };
              return (
                <View key={column.key} style={headerCellStyle}>
                  <Text style={styles.headerText}>{column.title}</Text>
                </View>
              );
            })}
          </View>

          {rows.map((row, index) => {
            const rowStyle = index % 2 === 1 ? { ...styles.dataRow, ...styles.altRow } : styles.dataRow;
            return (
              <View key={rowKey(row)} style={rowStyle}>
                {columns.map((column) => {
                  const cellStyle = {
                    ...styles.cell,
                    width: column.width ?? 160,
                    minHeight: compact ? theme.layout.rowHeight : 48,
                  };

                  return (
                    <View key={column.key} style={cellStyle}>
                      {column.render(row)}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  inner: {
    minWidth: 900,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  altRow: {
    backgroundColor: theme.colors.background.secondary,
  },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  headerCell: {
    minHeight: 36,
  },
  headerText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
