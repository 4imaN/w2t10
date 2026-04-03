import React from 'react';

export default function DataTable({ columns, data, onRowClick, emptyMessage = 'No data found' }) {
  if (!data || data.length === 0) {
    return (
      <div className="card p-8 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col, i) => (
                <th key={i} className="text-left px-4 py-3 font-medium text-muted-foreground">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr
                key={row._id || rowIdx}
                className={`border-b last:border-0 transition-colors duration-100 ${onRowClick ? 'hover:bg-muted/30 cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="px-4 py-3">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
