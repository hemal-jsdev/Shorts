import { NextResponse } from 'next/server';
import { getPayload, handleEndpoints } from 'payload';
import config from '@payload-config';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = await getPayload({ config });
    const doc: any = await payload.findByID({
      collection: 'reels',
      id,
      depth: 1,
    });

    if (!doc) {
      return NextResponse.json({ error: 'Reel not found' }, { status: 404 });
    }

    const author = typeof doc.author === 'object' && doc.author !== null ? doc.author : {};

    const reel = {
      id: String(doc.id),
      userId: author.id ? String(author.id) : 'usr_default',
      streamUid: doc.streamUid || null,
      hlsUrl: doc.hlsUrl || '',
      dashUrl: doc.dashUrl || null,
      thumbnailUrl: doc.thumbnailUrl || null,
      animatedWebpUrl: doc.animatedWebpUrl || null,
      caption: doc.caption || '',
      status: doc.status || 'READY',
      createdAt: doc.createdAt,
      isLiked: false,
      user: {
        id: author.id ? String(author.id) : 'usr_default',
        username: author.username || 'creator',
        displayName: author.displayName || author.username || 'Creator',
        avatarUrl: author.avatarUrl || null,
        bio: author.bio || null,
        isVerified: !!author.isVerified,
      },
    };

    return NextResponse.json({ data: reel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const response = await handleEndpoints({
      config,
      path: `/api/reels/${id}`,
      request: req,
    });
    if (response) return response;

    const payload = await getPayload({ config });
    const result = await payload.delete({
      collection: 'reels',
      id,
    });

    return NextResponse.json({
      message: 'Reel deleted successfully.',
      doc: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { errors: [{ message: error?.message || 'Failed to delete reel' }] },
      { status: error?.status || 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const response = await handleEndpoints({
      config,
      path: `/api/reels/${id}`,
      request: req,
    });
    if (response) return response;

    const body = await req.json().catch(() => ({}));
    const payload = await getPayload({ config });
    const result = await payload.update({
      collection: 'reels',
      id,
      data: body,
    });

    return NextResponse.json({
      message: 'Reel updated successfully.',
      doc: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { errors: [{ message: error?.message || 'Failed to update reel' }] },
      { status: error?.status || 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleEndpoints({
    config,
    path: `/api/reels/${id}`,
    request: req,
  });
}

export async function OPTIONS(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleEndpoints({
    config,
    path: `/api/reels/${id}`,
    request: req,
  });
}
