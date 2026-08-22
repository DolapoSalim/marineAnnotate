from app.models import Project, ProjectMember, ProjectRole, UserRole
from tests.conftest import ADMIN_PASSWORD, login, make_user


async def test_non_admin_cannot_list_users(client, db_session):
    user = await make_user(db_session, "plain@test.local", "PlainPass123")
    token = await login(client, user.email, "PlainPass123")

    r = await client.get("/api/users/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_admin_can_list_users(client, admin_user):
    token = await login(client, admin_user.email, ADMIN_PASSWORD)
    r = await client.get("/api/users/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200


async def test_non_admin_cannot_change_roles(client, db_session):
    target = await make_user(db_session, "target@test.local", "TargetPass123")
    attacker = await make_user(db_session, "attacker@test.local", "AttackerPass123")
    token = await login(client, attacker.email, "AttackerPass123")

    r = await client.patch(
        f"/api/users/{target.id}",
        json={"role": "admin"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


async def test_non_member_cannot_access_project(client, db_session):
    owner = await make_user(db_session, "owner@test.local", "OwnerPass123")
    outsider = await make_user(db_session, "outsider@test.local", "OutsiderPass123")

    project = Project(name="Secret Project", created_by=owner.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.OWNER))
    await db_session.commit()
    await db_session.refresh(project)

    token = await login(client, outsider.email, "OutsiderPass123")
    r = await client.get(f"/api/projects/{project.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_member_can_access_project(client, db_session):
    owner = await make_user(db_session, "owner2@test.local", "OwnerPass123")

    project = Project(name="Visible Project", created_by=owner.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.OWNER))
    await db_session.commit()
    await db_session.refresh(project)

    token = await login(client, owner.email, "OwnerPass123")
    r = await client.get(f"/api/projects/{project.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["name"] == "Visible Project"


async def test_non_owner_member_cannot_delete_project(client, db_session):
    owner = await make_user(db_session, "owner3@test.local", "OwnerPass123")
    annotator = await make_user(db_session, "annotator@test.local", "AnnotatorPass123")

    project = Project(name="Protected Project", created_by=owner.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.OWNER))
    db_session.add(ProjectMember(project_id=project.id, user_id=annotator.id, role=ProjectRole.ANNOTATOR))
    await db_session.commit()
    await db_session.refresh(project)

    token = await login(client, annotator.email, "AnnotatorPass123")
    r = await client.delete(f"/api/projects/{project.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
