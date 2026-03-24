import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MessagesModal } from './MessagesModal'

describe('MessagesModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state while fetching', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {})) // never resolves
    render(<MessagesModal runId={1} onClose={() => {}} />)
    expect(screen.getByTestId('messages-loading')).toBeInTheDocument()
  })

  it('renders conversation messages', async () => {
    const messages = [
      { role: 'user', content: 'Fix the bug' },
      { role: 'assistant', content: 'I will fix it now' },
    ]
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(messages),
    } as Response)

    render(<MessagesModal runId={1} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Fix the bug')).toBeInTheDocument()
      expect(screen.getByText('I will fix it now')).toBeInTheDocument()
    })
  })

  it('shows expired notice on 204', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(),
    } as Response)

    render(<MessagesModal runId={1} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/expired/i)).toBeInTheDocument()
    })
  })

  it('calls onClose when close button clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    } as Response)

    const onClose = vi.fn()
    render(<MessagesModal runId={1} onClose={onClose} />)
    await waitFor(() => screen.getByTestId('close-modal'))
    fireEvent.click(screen.getByTestId('close-modal'))
    expect(onClose).toHaveBeenCalled()
  })
})
