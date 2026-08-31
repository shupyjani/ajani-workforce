import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Pagination({
  currentPage,
  hasNextPage,
  onNextPage,
  onPreviousPage,
}: {
  readonly currentPage: number
  readonly hasNextPage: boolean
  readonly onNextPage: () => void
  readonly onPreviousPage: () => void
}) {
  return (
    <nav aria-label="Table pagination" className="pagination">
      <p>
        Page <strong>{currentPage}</strong>
      </p>
      <div>
        <button
          aria-label="Previous page"
          className="icon-button icon-button--bordered"
          disabled={currentPage === 1}
          onClick={onPreviousPage}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <button
          aria-label="Next page"
          className="icon-button icon-button--bordered"
          disabled={!hasNextPage}
          onClick={onNextPage}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>
    </nav>
  )
}
