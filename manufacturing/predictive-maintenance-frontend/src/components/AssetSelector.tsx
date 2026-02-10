import React from 'react';

interface AssetSelectorProps {
  assetIds: string[];
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
}

export function AssetSelector({ assetIds, selectedAssetId, onSelect }: AssetSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-gray-700">Asset</label>
      <select
        value={selectedAssetId || ''}
        onChange={(event) => onSelect(event.target.value)}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
      >
        {assetIds.map((assetId) => (
          <option key={assetId} value={assetId}>
            {assetId}
          </option>
        ))}
      </select>
    </div>
  );
}
