import { motion } from 'framer-motion'
import { X } from 'lucide-react'

import { FAL_MODEL_OPTIONS } from '../config/appConfig.js'
import { CELL_TYPES, KHRONOS_REFERENCE_CELLS, WORKSPACE_PANELS } from '../domain/cellData.js'
import { getAvailableOrganelleIds, getCell, getCellProfile, getOrganelleDetail } from '../domain/cellCatalog.js'
import { CellThumb } from './CellThumb.jsx'

function findCell(cells, cellId) {
  return cells.find((cell) => cell.id === cellId) ?? getCell(cellId)
}

export function WorkspaceDrawer({
  activePanel,
  selectedCell,
  selectedOrganelle,
  compareCell,
  allCells = CELL_TYPES,
  customCells = [],
  galleryItems,
  notes,
  settings,
  labelVisible,
  crossSection,
  selectedMicroscope,
  uploadedImage,
  favoriteKey,
  onClose,
  onSelectCell,
  onSelectOrganelle,
  onSetCompareCell,
  onSaveGallery,
  onClearGallery,
  onUpdateNote,
  onUpdateSettings,
  onSetLabelVisible,
  onSetCrossSection,
  onExport,
  onNotify,
}) {
  if (!activePanel) return null

  const cell = findCell(allCells, selectedCell)
  const compare = findCell(allCells, compareCell)
  const detail = getOrganelleDetail(selectedCell, selectedOrganelle, customCells)
  const profile = getCellProfile(selectedCell, customCells)
  const noteKey = `${selectedCell}:${selectedOrganelle}`
  const noteValue = notes[noteKey] ?? ''
  const savedFavorite = favoriteKey ? favoriteKey.replace(':', ' / ') : 'None'

  function renderContent() {
    if (activePanel === 'Gallery') {
      return (
        <div className="drawer-content">
          <div className="gallery-hero">
            <CellThumb cell={cell} selected />
            <div>
              <strong>{cell.name}</strong>
              <span>{detail.title} · {selectedMicroscope}</span>
            </div>
          </div>
          <div className="drawer-actions">
            <button type="button" className="drawer-primary" onClick={onSaveGallery}>Save View</button>
            <button type="button" className="drawer-secondary" onClick={onExport}>Export GLB</button>
          </div>
          {uploadedImage && (
            <div className="uploaded-tile" style={{ '--upload-preview': `url(${uploadedImage.url})` }}>
              <span />
              <div>
                <strong>{uploadedImage.name}</strong>
                <small>Attached microscope reference</small>
              </div>
            </div>
          )}
          <div className="drawer-list">
            {galleryItems.length === 0 ? (
              <p className="empty-state">No saved views yet.</p>
            ) : (
              galleryItems.map((item) => {
                const itemCell = findCell(allCells, item.cellId)
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="drawer-row"
                    onClick={() => {
                      onSelectCell(item.cellId)
                      onSelectOrganelle(item.organelleId)
                      onNotify('Saved view restored')
                    }}
                  >
                    <CellThumb cell={itemCell} selected={item.cellId === selectedCell} />
                    <span>
                      <strong>{itemCell.name}</strong>
                      <small>{getOrganelleDetail(item.cellId, item.organelleId, customCells).title} · {item.microscope}</small>
                    </span>
                  </button>
                )
              })
            )}
          </div>
          {galleryItems.length > 0 && <button type="button" className="drawer-secondary full" onClick={onClearGallery}>Clear Gallery</button>}
        </div>
      )
    }

    if (activePanel === 'Library') {
      return (
        <div className="drawer-content">
          <p className="drawer-copy">{profile.summary}</p>
          <div className="reference-section">
            <strong>Khronos Reference Models</strong>
            <span>Auxiliary GLB/PBR samples for material and loader checks.</span>
            <div className="reference-grid">
              {KHRONOS_REFERENCE_CELLS.map((reference) => (
                <button
                  key={reference.id}
                  type="button"
                  className={selectedCell === reference.id ? 'reference-card active' : 'reference-card'}
                  onClick={() => {
                    onSelectCell(reference.id)
                    onNotify(`${reference.name} reference loaded`)
                  }}
                >
                  <CellThumb cell={reference} selected={selectedCell === reference.id} />
                  <span>
                    <strong>{reference.name}</strong>
                    <small>{reference.referenceLicense}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="library-grid">
            {getAvailableOrganelleIds(selectedCell, customCells).map((id) => {
              const item = getOrganelleDetail(selectedCell, id, customCells)
              return (
                <button
                  key={id}
                  type="button"
                  className={selectedOrganelle === id ? 'library-card active' : 'library-card'}
                  onClick={() => {
                    onSelectOrganelle(id)
                    onNotify(`${item.title} selected`)
                  }}
                >
                  <span style={{ background: item.accent }} />
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (activePanel === 'Notebooks') {
      return (
        <div className="drawer-content">
          <label className="note-editor">
            <span>{cell.name} / {detail.title}</span>
            <textarea
              value={noteValue}
              onChange={(event) => onUpdateNote(noteKey, event.target.value)}
              placeholder="Record observations, questions, or narration notes..."
            />
          </label>
          <div className="drawer-meta inline">
            <span>{noteValue.length} chars</span>
            <span>Autosaved locally</span>
            <span>{Object.keys(notes).length} notes</span>
          </div>
        </div>
      )
    }

    if (activePanel === 'Settings') {
      return (
        <div className="drawer-content settings-list">
          <label className="settings-row">
            <span>
              <strong>Organelle Labels</strong>
              <small>Show the floating label on the stage.</small>
            </span>
            <input type="checkbox" checked={labelVisible} onChange={(event) => onSetLabelVisible(event.target.checked)} />
          </label>
          <label className="settings-row">
            <span>
              <strong>Cross-Section</strong>
              <small>Keep the cutaway view enabled.</small>
            </span>
            <input type="checkbox" checked={crossSection} onChange={(event) => onSetCrossSection(event.target.checked)} />
          </label>
          <div className="settings-row">
            <span>
              <strong>Render Quality</strong>
              <small>Balanced is faster; high uses denser DPR.</small>
            </span>
            <div className="segmented">
              {['balanced', 'high'].map((quality) => (
                <button
                  key={quality}
                  type="button"
                  className={settings.quality === quality ? 'active' : ''}
                  onClick={() => onUpdateSettings({ ...settings, quality })}
                >
                  {quality}
                </button>
              ))}
            </div>
          </div>
          <label className="settings-row">
            <span>
              <strong>Compact UI</strong>
              <small>Slightly tighter panels for smaller screens.</small>
            </span>
            <input type="checkbox" checked={settings.compactUi} onChange={(event) => onUpdateSettings({ ...settings, compactUi: event.target.checked })} />
          </label>
          <label className="settings-row">
            <span>
              <strong>Fal Model</strong>
              <small>Submodel used when Fal generation is selected.</small>
            </span>
            <select
              className="settings-select"
              value={settings.falModelId}
              onChange={(event) => onUpdateSettings({ ...settings, falModelId: event.target.value })}
            >
              {FAL_MODEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id} title={option.description}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      )
    }

    if (activePanel === 'Compare') {
      return (
        <div className="drawer-content">
          <div className="compare-drawer-grid">
            {[cell, compare].map((item) => {
              const itemProfile = getCellProfile(item.id, customCells)
              return (
                <div key={item.id} className="compare-card">
                  <CellThumb cell={item} selected={item.id === selectedCell} />
                  <strong>{item.name}</strong>
                  <small>{itemProfile.summary}</small>
                </div>
              )
            })}
          </div>
          <p className="drawer-copy">{profile.comparison}</p>
          <div className="cell-chip-grid">
            {allCells.filter((item) => item.id !== selectedCell).map((item) => (
              <button key={item.id} type="button" className={item.id === compareCell ? 'active' : ''} onClick={() => onSetCompareCell(item.id)}>
                {item.name.replace(' Cell', '')}
              </button>
            ))}
          </div>
          <div className="drawer-actions">
            <button type="button" className="drawer-primary" onClick={() => onSelectCell(compareCell)}>Open Compared Cell</button>
            <button type="button" className="drawer-secondary" onClick={() => onSetCompareCell(profile.compareTarget)}>Reset Target</button>
          </div>
        </div>
      )
    }

    return (
      <div className="drawer-content">
        <div className="profile-stats">
          <span><strong>{allCells.length}</strong><small>cells</small></span>
          <span><strong>{galleryItems.length}</strong><small>saved</small></span>
          <span><strong>{Object.keys(notes).length}</strong><small>notes</small></span>
        </div>
        <p className="drawer-copy">Favorite: {savedFavorite}</p>
        <p className="drawer-copy">Occurs: {profile.occurs}</p>
      </div>
    )
  }

  return (
    <motion.section className="workspace-drawer" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <header>
        <div>
          <strong>{activePanel}</strong>
          <span>{WORKSPACE_PANELS[activePanel]}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close panel">
          <X size={15} />
        </button>
      </header>
      <div className="drawer-meta">
        <span>{cell.name}</span>
        <span>{detail.title}</span>
        <span>Cross-section ready</span>
      </div>
      {renderContent()}
    </motion.section>
  )
}
