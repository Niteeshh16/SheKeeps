package com.shekeeps.auth.controller;

import com.shekeeps.auth.dto.ApiModels.User;
import com.shekeeps.auth.exception.ApiException;
import com.shekeeps.auth.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.sql.Date;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;

@RestController
@RequestMapping("/api")
public class WorkspaceController {
    private final JdbcTemplate db;
    private final AuthService auth;

    public WorkspaceController(JdbcTemplate db, AuthService auth) { this.db = db; this.auth = auth; }

    public record NoteInput(@NotBlank @Size(max=200) String title, String content,
                            @Size(max=40) String category, @Size(max=20) String color) {}
    public record TaskInput(@NotBlank @Size(max=200) String title, String details, LocalDate dueDate,
                            String priority, Boolean completed) {}
    public record JournalInput(LocalDate entryDate, @Size(max=200) String title, String content, String mood) {}

    @GetMapping("/notes") public Map<String,Object> notes(HttpServletRequest request) {
        UUID uid = userId(request);
        var rows = db.query("SELECT id,title,content,category,color,created_at,updated_at FROM notes WHERE user_id=? ORDER BY updated_at DESC",
                (rs,n) -> Map.of("id",rs.getObject("id",UUID.class),"title",rs.getString("title"),"content",rs.getString("content"),"category",rs.getString("category"),"color",rs.getString("color"),"createdAt",rs.getObject("created_at",OffsetDateTime.class),"updatedAt",rs.getObject("updated_at",OffsetDateTime.class)), uid);
        return ok(rows);
    }
    @PostMapping("/notes") @ResponseStatus(HttpStatus.CREATED) public Map<String,Object> createNote(@Valid @RequestBody NoteInput body,HttpServletRequest request) {
        UUID uid=userId(request); String category=or(body.category(),"Personal"), color=or(body.color(),"lavender");
        return ok(db.queryForMap("INSERT INTO notes(user_id,title,content,category,color) VALUES(?,?,?,?,?) RETURNING id,title,content,category,color,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",uid,body.title().trim(),or(body.content(),""),category,color));
    }
    @PutMapping("/notes/{id}") public Map<String,Object> updateNote(@PathVariable UUID id,@Valid @RequestBody NoteInput body,HttpServletRequest request) {
        return ok(db.queryForMap("UPDATE notes SET title=?,content=?,category=?,color=?,updated_at=NOW() WHERE id=? AND user_id=? RETURNING id,title,content,category,color,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",body.title().trim(),or(body.content(),""),or(body.category(),"Personal"),or(body.color(),"lavender"),id,userId(request)));
    }
    @DeleteMapping("/notes/{id}") public Map<String,Object> deleteNote(@PathVariable UUID id,HttpServletRequest request) { delete("notes",id,userId(request)); return Map.of("status","success","message","Note deleted"); }

    @GetMapping("/tasks") public Map<String,Object> tasks(HttpServletRequest request) {
        var rows=db.query("SELECT id,title,details,due_date,priority,completed,created_at,updated_at FROM tasks WHERE user_id=? ORDER BY completed ASC,due_date ASC NULLS LAST,created_at DESC",
                (rs,n) -> { var m=new LinkedHashMap<String,Object>(); m.put("id",rs.getObject("id",UUID.class));m.put("title",rs.getString("title"));m.put("details",rs.getString("details"));m.put("dueDate",rs.getObject("due_date",LocalDate.class));m.put("priority",rs.getString("priority"));m.put("completed",rs.getBoolean("completed"));m.put("createdAt",rs.getObject("created_at",OffsetDateTime.class));m.put("updatedAt",rs.getObject("updated_at",OffsetDateTime.class));return m; },userId(request));
        return ok(rows);
    }
    @PostMapping("/tasks") @ResponseStatus(HttpStatus.CREATED) public Map<String,Object> createTask(@Valid @RequestBody TaskInput body,HttpServletRequest request) {
        String priority=priority(body.priority());
        return ok(db.queryForMap("INSERT INTO tasks(user_id,title,details,due_date,priority,completed) VALUES(?,?,?,?,?,?) RETURNING id,title,details,due_date AS \"dueDate\",priority,completed,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",userId(request),body.title().trim(),or(body.details(),""),body.dueDate()==null?null:Date.valueOf(body.dueDate()),priority,Boolean.TRUE.equals(body.completed())));
    }
    @PutMapping("/tasks/{id}") public Map<String,Object> updateTask(@PathVariable UUID id,@Valid @RequestBody TaskInput body,HttpServletRequest request) {
        return ok(db.queryForMap("UPDATE tasks SET title=?,details=?,due_date=?,priority=?,completed=?,updated_at=NOW() WHERE id=? AND user_id=? RETURNING id,title,details,due_date AS \"dueDate\",priority,completed,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",body.title().trim(),or(body.details(),""),body.dueDate()==null?null:Date.valueOf(body.dueDate()),priority(body.priority()),Boolean.TRUE.equals(body.completed()),id,userId(request)));
    }
    @PatchMapping("/tasks/{id}/complete") public Map<String,Object> completeTask(@PathVariable UUID id,@RequestBody Map<String,Boolean> body,HttpServletRequest request) {
        return ok(db.queryForMap("UPDATE tasks SET completed=?,updated_at=NOW() WHERE id=? AND user_id=? RETURNING id,title,details,due_date AS \"dueDate\",priority,completed,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",Boolean.TRUE.equals(body.get("completed")),id,userId(request)));
    }
    @DeleteMapping("/tasks/{id}") public Map<String,Object> deleteTask(@PathVariable UUID id,HttpServletRequest request) { delete("tasks",id,userId(request)); return Map.of("status","success","message","Task deleted"); }

    @GetMapping("/journal") public Map<String,Object> journal(HttpServletRequest request) {
        var rows=db.query("SELECT id,entry_date,title,content,mood,created_at,updated_at FROM journal_entries WHERE user_id=? ORDER BY entry_date DESC",
                (rs,n)->Map.of("id",rs.getObject("id",UUID.class),"entryDate",rs.getObject("entry_date",LocalDate.class),"title",rs.getString("title"),"content",rs.getString("content"),"mood",rs.getString("mood"),"createdAt",rs.getObject("created_at",OffsetDateTime.class),"updatedAt",rs.getObject("updated_at",OffsetDateTime.class)),userId(request));
        return ok(rows);
    }
    @PostMapping("/journal") @ResponseStatus(HttpStatus.CREATED) public Map<String,Object> createJournal(@Valid @RequestBody JournalInput body,HttpServletRequest request) {
        LocalDate date=body.entryDate()==null?LocalDate.now():body.entryDate();
        return ok(db.queryForMap("INSERT INTO journal_entries(user_id,entry_date,title,content,mood) VALUES(?,?,?,?,?) ON CONFLICT(user_id,entry_date) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,mood=EXCLUDED.mood,updated_at=NOW() RETURNING id,entry_date AS \"entryDate\",title,content,mood,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",userId(request),date,or(body.title(),""),or(body.content(),""),or(body.mood(),"Calm")));
    }
    @PutMapping("/journal/{id}") public Map<String,Object> updateJournal(@PathVariable UUID id,@Valid @RequestBody JournalInput body,HttpServletRequest request) {
        LocalDate date=body.entryDate()==null?LocalDate.now():body.entryDate();
        return ok(db.queryForMap("UPDATE journal_entries SET entry_date=?,title=?,content=?,mood=?,updated_at=NOW() WHERE id=? AND user_id=? RETURNING id,entry_date AS \"entryDate\",title,content,mood,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",date,or(body.title(),""),or(body.content(),""),or(body.mood(),"Calm"),id,userId(request)));
    }
    @DeleteMapping("/journal/{id}") public Map<String,Object> deleteJournal(@PathVariable UUID id,HttpServletRequest request) { delete("journal_entries",id,userId(request)); return Map.of("status","success","message","Journal entry deleted"); }

    private UUID userId(HttpServletRequest request) { User user=auth.authenticate(accessToken(request)); return user.id(); }
    private String accessToken(HttpServletRequest request) {
        String header=request.getHeader(HttpHeaders.AUTHORIZATION);
        if(header!=null && header.startsWith("Bearer ")) return header.substring(7);
        if(request.getCookies()!=null) for(var cookie:request.getCookies()) if(cookie.getName().equals("accessToken")) return cookie.getValue();
        return null;
    }
    private void delete(String table,UUID id,UUID uid) {
        int count=db.update("DELETE FROM "+table+" WHERE id=? AND user_id=?",id,uid);
        if(count==0) throw new ApiException(HttpStatus.NOT_FOUND,"Item not found");
    }
    private Map<String,Object> ok(Object data) { return Map.of("status","success","data",data); }
    private String or(String value,String fallback) { return value==null?fallback:value; }
    private String priority(String value) {
        String p=or(value,"normal").toLowerCase(Locale.ROOT);
        if(!Set.of("low","normal","high").contains(p)) throw new ApiException(HttpStatus.BAD_REQUEST,"Priority must be low, normal, or high");
        return p;
    }
}
